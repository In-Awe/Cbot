import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { HeatTracker } from './components/HeatTracker';
import { OpenPositions } from './components/OpenPositions';
import { ConnectionPanel } from './components/ConnectionPanel';
import { AnalysisLog } from './components/AnalysisLog';
import { Terminal } from './components/Terminal';
import { SimulationControl } from './components/SimulationControl';
import { LivePriceFeed } from './components/PriceHistoryLog';
import { LivePrices } from './components/LivePrices';
import { BotStrategy } from './components/BotStrategy';
import type { Trade, AnalysisLogEntry, TerminalLogEntry, SimulationStatus, PriceHistoryLogEntry, HeatScores } from './types';
import { XrpUsdTrader } from './services/botService';
import { fetchHistorical1mKlines, fetchHistorical1sKlines, fetchKlinesSince } from './services/binanceService';
import { addPriceHistory, getPriceHistory, getFullPriceHistory, getHistoryCounts, initDBForPairs } from './services/dbService';
import { exportToCsv } from './services/exportService';

const App: React.FC = () => {
    const [openTrades, setOpenTrades] = useState<Trade[]>([]);
    const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
    const [heatScores, setHeatScores] = useState<HeatScores | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    
    const [liveCandles, setLiveCandles] = useState<PriceHistoryLogEntry[]>([]);
    const [priceHistoryCounts, setPriceHistoryCounts] = useState<Record<string, number>>({ 'XRP/USDT': 0 });
    const [livePrice, setLivePrice] = useState<PriceHistoryLogEntry | undefined>();

    const [error, setError] = useState<string | null>(null);
    const [simulationStatus, setSimulationStatus] = useState<SimulationStatus>('stopped');

    const [analysisLog, setAnalysisLog] = useState<AnalysisLogEntry[]>([]);
    const [terminalLog, setTerminalLog] = useState<TerminalLogEntry[]>([]);
    const [isBinanceConnected, setIsBinanceConnected] = useState(false);

    const [dailyTradeCount, setDailyTradeCount] = useState(0);
    const [dailyTradeLimit, setDailyTradeLimit] = useState(100);

    const botInstanceRef = useRef<XrpUsdTrader | null>(null);
    const intervalRef = useRef<number | null>(null);
    const openTradesRef = useRef<Trade[]>([]);

    const TRADING_PAIR = 'XRP/USDT';
    const TICK_INTERVAL = 2000; // 2 seconds

    const addLog = useCallback((message: string, type: TerminalLogEntry['type'] = 'info', data?: any) => {
        const newEntry: TerminalLogEntry = {
            id: Date.now() + Math.random(),
            timestamp: new Date(),
            message,
            type,
            data: data ? JSON.stringify(data, null, 2) : undefined,
        };
        setTerminalLog(prev => [newEntry, ...prev.slice(0, 199)]);
    }, []);

    const refreshPriceHistoryFromDB = useCallback(async () => {
        const counts = await getHistoryCounts([TRADING_PAIR]);
        setPriceHistoryCounts(counts);
    }, []);
    
    // Main analysis loop
    const runMainTick = useCallback(async () => {
        if (!botInstanceRef.current) {
            addLog('Bot not initialized for analysis.', 'error');
            return;
        }

        try {
            const ROLLING_WINDOW_SECONDS = 360; // 6 minutes
            const startTime = Date.now() - ROLLING_WINDOW_SECONDS * 1000;
            const recentKlines = await fetchKlinesSince(TRADING_PAIR, '1s', startTime);

            if (recentKlines.length > 0) {
                botInstanceRef.current.initializeBuffer(recentKlines);
            } else {
                addLog('No recent 1s kline data received from API.', 'warn');
            }

            const { heatScores: newHeatScores } = botInstanceRef.current.runAnalysis();

            // Manage trades
            const latestLivePriceEntry = recentKlines.length > 0 ? recentKlines[recentKlines.length - 1] : null;
            const latestLivePrice = latestLivePriceEntry?.close ?? 0;
                
            const dailyTradeLimit = botInstanceRef.current.getDailyTradeLimit();
            const dailyTradeCount = botInstanceRef.current.getDailyTradeCount();
            const canTrade = dailyTradeCount < dailyTradeLimit && openTradesRef.current.length === 0;

            let tradeToOpen: { direction: 'LONG' | 'SHORT'; reason: string } | null = null;
            const CONFIDENCE_THRESHOLD = botInstanceRef.current.getConfidenceThreshold();

            if (canTrade && newHeatScores['1s']) {
                if (newHeatScores['1s'].buy >= CONFIDENCE_THRESHOLD) {
                    tradeToOpen = { direction: 'LONG', reason: `1s Buy Impulse at ${newHeatScores['1s'].buy}% confidence` };
                } else if (newHeatScores['1s'].sell >= CONFIDENCE_THRESHOLD) {
                    tradeToOpen = { direction: 'SHORT', reason: `1s Sell Impulse at ${newHeatScores['1s'].sell}% confidence` };
                }
            }
                    
            const dynamicThreshold = botInstanceRef.current.getLastDynamicPriceThreshold();
            const note = newHeatScores['1s']
                ? `Impulse 1s (Buy/Sell): ${newHeatScores['1s'].buy}/${newHeatScores['1s'].sell}. Dyn. Thresh: ${dynamicThreshold.toFixed(4)}%`
                : 'Waiting for impulse signals.';

            const analysisEntry: AnalysisLogEntry = {
                id: `analysis-${Date.now()}`,
                timestamp: new Date(),
                pair: TRADING_PAIR,
                price: latestLivePrice,
                action: tradeToOpen ? 'setup_found' : 'hold',
                note: tradeToOpen ? `${tradeToOpen.reason}. ${note}`: note,
            };
            
            if (tradeToOpen) {
                const consolidationSlice = botInstanceRef.current.getRecentCandles(300);
                if (consolidationSlice.length > 0) {
                     const high = Math.max(...consolidationSlice.map(c => c.high));
                     const low = Math.min(...consolidationSlice.map(c => c.low));

                    const newTrade: Trade = {
                        id: `trade-${Date.now()}`,
                        pair: TRADING_PAIR,
                        direction: tradeToOpen.direction,
                        entryPrice: latestLivePrice,
                        stopLoss: tradeToOpen.direction === 'LONG' ? low : high,
                        openedAt: new Date(),
                        status: 'active',
                        sizeUnits: 1,
                        reason: tradeToOpen.reason,
                    };
                    openTradesRef.current = [newTrade, ...openTradesRef.current];
                    botInstanceRef.current.recordTradeExecution();
                    
                    addLog(`New ${newTrade.direction} trade opened based on Impulse Tracker signal.`, 'response', newTrade);
                }
            }

            // Update state for UI
            setHeatScores(newHeatScores);
            setLastUpdated(new Date());
            setLiveCandles(recentKlines.slice().reverse());
            setLivePrice(latestLivePriceEntry);
            setAnalysisLog(prev => [analysisEntry, ...prev.slice(0, 199)]);
            setDailyTradeCount(botInstanceRef.current.getDailyTradeCount());
            setOpenTrades(openTradesRef.current);

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            addLog(`Tick failed: ${errorMessage}`, 'error', e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { error: e });
        }
    }, [addLog]);


    useEffect(() => {
        const initialLoad = async () => {
            addLog('App initialized for XRP/USDT trading.', 'info');
            await initDBForPairs([TRADING_PAIR]);
            await refreshPriceHistoryFromDB();
        };
        initialLoad();
        
        // Cleanup interval on component unmount
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [addLog, refreshPriceHistoryFromDB]);
    
    const handleBinanceConnect = useCallback(async (key: string, secret: string) => {
        setIsBinanceConnected(true);
        addLog('Binance API Connected. Backfilling high-resolution data for bot...', 'info');
        
        try {
            await initDBForPairs([TRADING_PAIR]);
            addLog(`[${TRADING_PAIR}] Fetching 2 hours of 1-minute k-lines for historical export...`, 'info');
            const klines1m = await fetchHistorical1mKlines(TRADING_PAIR, 2);
            await addPriceHistory(TRADING_PAIR, klines1m);
            addLog(`[${TRADING_PAIR}] Stored ${klines1m.length} 1-minute k-lines.`, 'info');
            await refreshPriceHistoryFromDB();
            
            addLog(`[${TRADING_PAIR}] Fetching 2 hours of 1-second k-lines for live analysis buffer...`, 'info');
            const klines1s = await fetchHistorical1sKlines(TRADING_PAIR, 2);

            const tempBot = new XrpUsdTrader(key, secret);
            setDailyTradeLimit(tempBot.getDailyTradeLimit());
            tempBot.initializeBuffer(klines1s);
            botInstanceRef.current = tempBot;
            addLog(`Bot initialized with ${klines1s.length} pre-fetched candles.`, 'info');

        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            addLog(`Failed to backfill historical data: ${error}`, 'error');
            setIsBinanceConnected(false);
        }
    }, [addLog, refreshPriceHistoryFromDB]);
        
    const handlePlay = () => {
        if (!isBinanceConnected) {
            addLog('Cannot start live trading. Connect to Binance first.', 'error');
            return;
        }
        addLog(`Starting live analysis... Ticking every ${TICK_INTERVAL / 1000}s.`, 'request');
        setAnalysisLog([]);
        
        if (intervalRef.current) clearInterval(intervalRef.current);
        runMainTick(); // Run once immediately
        intervalRef.current = window.setInterval(runMainTick, TICK_INTERVAL);
        setSimulationStatus('live');
    };

    const handleStop = () => {
        addLog('Stopping analysis...', 'request');
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setSimulationStatus('stopped');
        setOpenTrades([]);
        openTradesRef.current = []; // Reset ref as well
        setHeatScores(null);
        setLastUpdated(null);
        setLiveCandles([]);
        setLivePrice(undefined);
    };
    
    const handleExport = useCallback(async (type: 'terminal' | 'analysis' | 'price_history') => {
        addLog(`Exporting ${type} to CSV...`, 'request');
        try {
            if (type === 'terminal') {
                exportToCsv('terminal_log.csv', terminalLog);
            } else if (type === 'analysis') {
                exportToCsv('analysis_log.csv', analysisLog);
            } else if (type === 'price_history') {
                const fullHistory = await getFullPriceHistory(TRADING_PAIR, '1m');
                exportToCsv('price_history_1m.csv', fullHistory);
            }
            addLog(`Export successful.`, 'response');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            addLog(`Export failed: ${msg}`, 'error');
        }
    }, [terminalLog, analysisLog]);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col">
            <Header />
            <main className="p-4 sm:p-6 lg:p-8 flex-grow mb-64">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-3 space-y-8">
                         <ConnectionPanel
                            isBinanceConnected={isBinanceConnected}
                            simulationStatus={simulationStatus}
                            onBinanceConnect={handleBinanceConnect}
                            onBinanceDisconnect={() => { setIsBinanceConnected(false); handleStop(); addLog('Binance API Disconnected.', 'info');}}
                        />
                        <SimulationControl
                            status={simulationStatus}
                            onPlay={handlePlay}
                            onStop={handleStop}
                            isBinanceConnected={isBinanceConnected}
                        />
                        <LivePrices price={livePrice} />
                    </div>
                    <div className="lg:col-span-9 flex flex-col gap-8">
                        {error && (
                            <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg">
                                <p className="font-bold">Error</p>
                                <p>{error}</p>
                            </div>
                        )}
                        <HeatTracker
                            heatScores={heatScores}
                            dailyTradeCount={dailyTradeCount}
                            dailyTradeLimit={dailyTradeLimit}
                            lastUpdated={lastUpdated}
                        />
                        <OpenPositions openTrades={openTrades} closedTrades={closedTrades} />
                        <AnalysisLog logEntries={analysisLog} onExport={() => handleExport('analysis')} />
                        <LivePriceFeed 
                            candles={liveCandles}
                            onExport={() => handleExport('price_history')} 
                        />
                        <BotStrategy />
                    </div>
                </div>
            </main>
            <Terminal logs={terminalLog} onExport={() => handleExport('terminal')} />
        </div>
    );
};

export default App;