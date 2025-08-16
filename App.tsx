
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { SignalDashboard } from './components/SignalDashboard';
import { OpenPositions } from './components/OpenPositions';
import { ConnectionPanel } from './components/ConnectionPanel';
import { AnalysisLog } from './components/AnalysisLog';
import { Terminal } from './components/Terminal';
import { SimulationControl } from './components/SimulationControl';
import { PriceHistoryLog } from './components/PriceHistoryLog';
import { PredictionAccuracy } from './components/PredictionAccuracy';
import { LivePrices } from './components/LivePrices';
import { ManualAnalysisModal } from './components/ManualAnalysisModal';
import { BotStrategy } from './components/BotStrategy';
import type { StrategyConfig, PendingOrder, Trade, AnalysisLogEntry, TerminalLogEntry, SimulationStatus, PriceHistoryLogEntry, PredictionAccuracyRecord, AnalysisEngine } from './types';
import { generateTradingSignals, constructGeminiPrompt } from './services/geminiService';
import { LeviathanBot } from './services/botService';
import { fetchKlinesSince, resampleKlinesTo15sCandles, fetchHistorical1mKlines, fetchHistoricalHighResCandles } from './services/binanceService';
import { addPriceHistory, getPriceHistory, getFullPriceHistory, getHistoryCounts, initDBForPairs, getLatestEntryTimestamp } from './services/dbService';
import { DEFAULT_STRATEGY_CONFIG } from './constants';

const PRICE_FETCH_INTERVAL = 15000; // 15 seconds

const App: React.FC = () => {
    const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
    const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
    const [openTrades, setOpenTrades] = useState<Trade[]>([]);
    const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
    
    const [displayPriceHistory, setDisplayPriceHistory] = useState<Record<string, PriceHistoryLogEntry[]>>({});
    const [priceHistoryCounts, setPriceHistoryCounts] = useState<Record<string, number>>({});
    const [livePrices, setLivePrices] = useState<Record<string, PriceHistoryLogEntry | undefined>>({});

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [simulationStatus, setSimulationStatus] = useState<SimulationStatus>('stopped');
    const [backtestProgress, setBacktestProgress] = useState(0);
    const [analysisEngine, setAnalysisEngine] = useState<AnalysisEngine>('internal');
    const [analysisLog, setAnalysisLog] = useState<AnalysisLogEntry[]>([]);
    const [terminalLog, setTerminalLog] = useState<TerminalLogEntry[]>([]);
    const [geminiApiKey, setGeminiApiKey] = useState<string>('');
    const [isGeminiConnected, setIsGeminiConnected] = useState(false);
    const [isBinanceConnected, setIsBinanceConnected] = useState(false);

    const intervalRef = useRef<number | null>(null);
    const priceFetchIntervalRef = useRef<number | null>(null);
    const configRef = useRef(config);
    const isBinanceConnectedRef = useRef(isBinanceConnected);
    const isBacktestRunningRef = useRef(false);
    const livePricesRef = useRef(livePrices);
    const lastFetchTimestampsRef = useRef<Record<string, number>>({});
    const botInstancesRef = useRef<Record<string, LeviathanBot>>({});

    useEffect(() => { configRef.current = config; }, [config]);
    useEffect(() => { isBinanceConnectedRef.current = isBinanceConnected; }, [isBinanceConnected]);
    useEffect(() => { livePricesRef.current = livePrices; }, [livePrices]);
    
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
        const pairs = configRef.current.trading_pairs;
        const newDisplayHistory: Record<string, PriceHistoryLogEntry[]> = {};
        for (const pair of pairs) {
            newDisplayHistory[pair] = await getPriceHistory(pair, 100);
        }
        setDisplayPriceHistory(newDisplayHistory);
        const counts = await getHistoryCounts(pairs);
        setPriceHistoryCounts(counts);
    }, []);

    useEffect(() => {
        const initialLoad = async () => {
            addLog('App initialized. Loading data from storage.', 'info');
            await initDBForPairs(config.trading_pairs);
            await refreshPriceHistoryFromDB();
        };
        initialLoad();
    }, []);

    const fetchAndStoreLiveCandles = useCallback(async (): Promise<void> => {
        const currentConfig = configRef.current;
        if (!isBinanceConnectedRef.current || currentConfig.trading_pairs.length === 0) {
            setLivePrices({});
            return;
        }

        try {
            const results = await Promise.all(currentConfig.trading_pairs.map(async (pair) => {
                const lastTimestamp = lastFetchTimestampsRef.current[pair] || (Date.now() - 30 * 1000);
                const newKlines1s = await fetchKlinesSince(pair, '1s', lastTimestamp + 1);

                if (newKlines1s.length === 0) return { pair, newCandles: [], latestCandle: undefined };

                const newCandles15s = resampleKlinesTo15sCandles(newKlines1s, pair);
                
                if (newCandles15s.length > 0) {
                    await addPriceHistory(pair, newCandles15s);
                    lastFetchTimestampsRef.current[pair] = newKlines1s[newKlines1s.length - 1].id;
                }
                
                return { pair, newCandles: newCandles15s, latestCandle: newCandles15s[newCandles15s.length - 1] };
            }));

            let shouldRefreshHistory = false;
            const newLivePrices: Record<string, PriceHistoryLogEntry> = {};
            results.forEach(({ pair, newCandles, latestCandle }) => {
                if (newCandles.length > 0) shouldRefreshHistory = true;
                const finalCandle = latestCandle || livePricesRef.current[pair];
                if (finalCandle) newLivePrices[pair] = finalCandle;
            });
            
            setLivePrices(prev => ({...prev, ...newLivePrices }));

            if (shouldRefreshHistory) {
                await refreshPriceHistoryFromDB();
            }

        } catch(e) {
            const error = e instanceof Error ? e.message : String(e);
            addLog(`Failed to fetch live candles from Binance: ${error}`, 'error');
        }
    }, [addLog, refreshPriceHistoryFromDB]);


    useEffect(() => {
        if (isBinanceConnected) {
            fetchAndStoreLiveCandles();
            priceFetchIntervalRef.current = window.setInterval(fetchAndStoreLiveCandles, PRICE_FETCH_INTERVAL);
            return () => {
                if (priceFetchIntervalRef.current) clearInterval(priceFetchIntervalRef.current);
            };
        } else {
            setLivePrices({});
        }
    }, [isBinanceConnected, fetchAndStoreLiveCandles]);
    
    const handleRunBacktest = useCallback(async () => {
        if (isBacktestRunningRef.current) return;

        setPendingOrders([]);
        setOpenTrades([]);
        setClosedTrades([]);
        setAnalysisLog([]);
        setBacktestProgress(0);
        setError(null);
        setSimulationStatus('backtesting');
        isBacktestRunningRef.current = true;
        addLog('Starting historical simulation with "Leviathan" engine...', 'request');

        try {
            const currentConfig = configRef.current;
            const backtestBots: Record<string, LeviathanBot> = {};
            const portfolios: Record<string, { balance: number }> = {};
            
            let backtestClosedTrades: Trade[] = [];
            let backtestAnalysisLog: AnalysisLogEntry[] = [];
            
            const pairs = currentConfig.trading_pairs;
            let totalCandles = 0;
            let processedCandles = 0;

            const allPairHistories: { pair: string, history: PriceHistoryLogEntry[] }[] = [];

            for (const pair of pairs) {
                const history1m = (await getFullPriceHistory(pair, '1m')).sort((a, b) => a.id - b.id);
                if (history1m.length < 100) {
                    addLog(`Not enough 1m history for ${pair} (${history1m.length} candles), skipping.`, 'warn');
                    continue;
                }
                allPairHistories.push({ pair, history: history1m });
                totalCandles += history1m.length;
                
                backtestBots[pair] = new LeviathanBot(pair, currentConfig);
                backtestBots[pair].prepareData(history1m);
                portfolios[pair] = { balance: currentConfig.total_capital_usd };
            }

            if (allPairHistories.length === 0) throw new Error("No pairs have sufficient historical data.");

            const mergedTimestamps = [...new Set(allPairHistories.flatMap(p => p.history.map(h => h.id)))].sort();
            
            let localOpenTrades: Trade[] = [];
            let localPendingOrders: PendingOrder[] = [];

            for (const timestamp of mergedTimestamps) {
                if (!isBacktestRunningRef.current) break;

                for (const { pair, history } of allPairHistories) {
                    const currentCandle = history.find(c => c.id === timestamp);
                    if (!currentCandle) continue;

                    const bot = backtestBots[pair];
                    const portfolio = portfolios[pair];
                    let openTrade = localOpenTrades.find(t => t.pair === pair) || null;
                    
                    // 1. Manage existing positions
                    if (openTrade) {
                        const { updatedTrade, pnl, reason, closedUnits } = bot.managePosition(openTrade, currentCandle.close);
                        if (updatedTrade) {
                            openTrade = { ...openTrade, ...updatedTrade };
                            localOpenTrades = localOpenTrades.map(t => t.id === openTrade!.id ? openTrade! : t);
                        }
                        if (pnl !== undefined) {
                            portfolio.balance += pnl;
                            addLog(`[${pair}] Partial close: ${reason}. PNL: $${pnl.toFixed(2)}`, 'info');
                        }
                        if (openTrade.status === 'closed') {
                            const finalTrade = { ...openTrade, pnl: (openTrade.pnl || 0) + (pnl || 0) };
                            backtestClosedTrades.push(finalTrade);
                            localOpenTrades = localOpenTrades.filter(t => t.id !== openTrade!.id);
                        }
                    }

                    // 2. Check for triggered pending orders
                    const pendingOrder = localPendingOrders.find(o => o.pair === pair);
                    if (pendingOrder && !openTrade) {
                        let triggered = false;
                        if (pendingOrder.direction === 'BUY' && currentCandle.high >= pendingOrder.entryPrice) triggered = true;
                        if (pendingOrder.direction === 'SELL' && currentCandle.low <= pendingOrder.entryPrice) triggered = true;
                        
                        if(triggered) {
                            const sizeUnits = bot.calculateInitialSize(pendingOrder.entryPrice, pendingOrder.stopLoss, portfolio.balance);
                            if (sizeUnits > 0) {
                                openTrade = {
                                    id: `${pair}-${timestamp}`, pair, direction: pendingOrder.direction === 'BUY' ? 'LONG' : 'SHORT',
                                    entryPrice: pendingOrder.entryPrice, openedAt: new Date(timestamp), status: 'active',
                                    sizeUnits, initialStopLoss: pendingOrder.stopLoss, stopLoss: pendingOrder.stopLoss,
                                    tp1Hit: false, tp2Hit: false,
                                    highWaterMark: pendingOrder.entryPrice, lowWaterMark: pendingOrder.entryPrice,
                                };
                                localOpenTrades.push(openTrade);
                                addLog(`[${pair}] Pending order triggered. Opened ${openTrade.direction} position.`, 'info');
                            }
                            localPendingOrders = localPendingOrders.filter(o => o.pair !== pair);
                        }
                    }

                    // 3. Check for new setups
                    if (!openTrade && !pendingOrder) {
                        const setupResult = bot.checkForSetup(timestamp);
                        if (setupResult && 'direction' in setupResult) {
                            localPendingOrders.push({ pair, direction: setupResult.direction, entryPrice: setupResult.entryPrice, stopLoss: setupResult.stopLoss });
                            backtestAnalysisLog.push({ id: `${pair}-${timestamp}`, timestamp: new Date(timestamp), pair, price: currentCandle.close, action: setupResult.direction === 'BUY' ? 'setup_buy' : 'setup_sell', note: setupResult.note });
                        } else if(setupResult) {
                            // Log 'hold' signals periodically to show bot is alive
                            if (Math.random() < 0.05) {
                                 backtestAnalysisLog.push({ id: `${pair}-${timestamp}`, timestamp: new Date(timestamp), pair, price: currentCandle.close, action: 'hold', note: setupResult.note });
                            }
                        }
                    }
                } // End pair loop
                
                processedCandles++;
                if (processedCandles % 100 === 0) {
                    setOpenTrades([...localOpenTrades]);
                    setPendingOrders([...localPendingOrders]);
                    setBacktestProgress((processedCandles / totalCandles) * 100);
                    await new Promise(res => setTimeout(res, 0));
                }
            } // End timestamp loop

            if (isBacktestRunningRef.current) {
                setAnalysisLog(backtestAnalysisLog.reverse());
                setClosedTrades(backtestClosedTrades.reverse());
                setOpenTrades([]);
                setPendingOrders([]);
                setSimulationStatus('backtest_complete');
                setBacktestProgress(100);
                const finalCapital = Object.values(portfolios).reduce((sum, p) => sum + p.balance, 0);
                const initialCapital = pairs.length * currentConfig.total_capital_usd;
                addLog(`Backtest complete. Final Capital: $${finalCapital.toFixed(2)}. Initial: $${initialCapital.toFixed(2)}. Generated ${backtestClosedTrades.length} trades.`, 'info');
            } else {
                addLog('Backtest stopped.', 'warn');
                setSimulationStatus('stopped');
            }

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Backtest Error: ${errorMessage}`);
            addLog(`Backtest Error: ${errorMessage}`, 'error');
            setSimulationStatus('stopped');
        } finally {
            isBacktestRunningRef.current = false;
        }
    }, [addLog]);

    const handleBinanceConnect = useCallback(async (key: string, secret: string) => {
        setIsBinanceConnected(true);
        addLog('Binance API Connected. Starting live price feed.', 'info');
        
        try {
            await initDBForPairs(configRef.current.trading_pairs);

            for (const pair of configRef.current.trading_pairs) {
                addLog(`Backfilling historical data for ${pair}... This may take a few minutes.`, 'request');
                
                addLog(`[${pair}] Fetching 30 hours of 1-minute k-lines...`, 'info');
                const klines1m = await fetchHistorical1mKlines(pair, 30);
                await addPriceHistory(pair, klines1m);
                addLog(`[${pair}] Stored ${klines1m.length} 1-minute k-lines.`, 'info');
                
                addLog(`[${pair}] Fetching 4 hours of 1s klines to create 15s candles...`, 'info');
                const candles15s = await fetchHistoricalHighResCandles(pair, 4);
                await addPriceHistory(pair, candles15s);
                addLog(`[${pair}] Stored ${candles15s.length} 15-second candles.`, 'info');

                const latestTimestamp = await getLatestEntryTimestamp(pair);
                if (latestTimestamp) {
                    lastFetchTimestampsRef.current[pair] = latestTimestamp;
                }
            }

            addLog('Historical data backfill completed for all pairs.', 'info');
            await refreshPriceHistoryFromDB();
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            addLog(`Failed to backfill historical data: ${error}`, 'error');
            setIsBinanceConnected(false);
        }
    }, [addLog, refreshPriceHistoryFromDB]);
        
    const handlePlay = async () => {
        addLog('Live simulation starting... Initializing bot profiles.', 'info');
        setPendingOrders([]);
        setOpenTrades([]);
        setClosedTrades([]);
        setAnalysisLog([]);
        setError(null);
        setSimulationStatus('running');

        const currentConfig = configRef.current;
        for (const pair of currentConfig.trading_pairs) {
            botInstancesRef.current[pair] = new LeviathanBot(pair, currentConfig);
            const history1m = (await getFullPriceHistory(pair, '1m')).sort((a, b) => a.id - b.id);
            if (history1m.length > 50) {
                botInstancesRef.current[pair].prepareData(history1m);
                addLog(`Bot for ${pair} initialized with ${history1m.length} candles.`, 'info');
            } else {
                 addLog(`Not enough history for ${pair} to initialize bot.`, 'warn');
            }
        }
    };

    const handleStop = () => {
        if (isBacktestRunningRef.current) {
            isBacktestRunningRef.current = false;
        } else {
            addLog('Simulation stopped.', 'info');
            setSimulationStatus('stopped');
            setPendingOrders([]);
            setOpenTrades([]);
        }
    };


    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col">
            <Header />
            <main className="p-4 sm:p-6 lg:p-8 flex-grow mb-64">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-3 space-y-8">
                         <ConnectionPanel
                            isGeminiConnected={isGeminiConnected}
                            isBinanceConnected={isBinanceConnected}
                            simulationStatus={simulationStatus}
                            onGeminiConnect={(apiKey) => { setGeminiApiKey(apiKey); setIsGeminiConnected(true); addLog('Gemini API Connected.', 'info'); }}
                            onBinanceConnect={handleBinanceConnect}
                            onGeminiDisconnect={() => { setIsGeminiConnected(false); setGeminiApiKey(''); addLog('Gemini API Disconnected.', 'info');}}
                            onBinanceDisconnect={() => { setIsBinanceConnected(false); addLog('Binance API Disconnected.', 'info');}}
                        />
                        <SimulationControl
                            status={simulationStatus}
                            analysisEngine={analysisEngine}
                            onPlay={handlePlay}
                            onPause={() => { addLog('Simulation paused.', 'info'); setSimulationStatus('paused'); }}
                            onStop={handleStop}
                            onAdvance={() => {}}
                            onManualAnalysis={() => {}}
                            onEngineChange={setAnalysisEngine}
                            onRunBacktest={handleRunBacktest}
                            backtestProgress={backtestProgress}
                            isDisabled={!isBinanceConnected}
                            isManualDisabled={true}
                        />
                        <LivePrices prices={livePrices} trading_pairs={config.trading_pairs} />
                        <ControlPanel
                            initialConfig={config}
                            onConfigChange={setConfig}
                            onAnalyze={() => {}}
                            isLoading={isLoading}
                            isSimulating={simulationStatus !== 'stopped'}
                        />
                    </div>
                    <div className="lg:col-span-9 flex flex-col gap-8">
                        {error && (
                            <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg">
                                <p className="font-bold">Error</p>
                                <p>{error}</p>
                            </div>
                        )}
                        <SignalDashboard
                            pendingOrders={pendingOrders}
                            isLoading={isLoading && pendingOrders.length === 0}
                        />
                        <OpenPositions openTrades={openTrades} closedTrades={closedTrades} />
                        <AnalysisLog logEntries={analysisLog} onExport={() => {}} />
                        <PriceHistoryLog 
                            trading_pairs={config.trading_pairs}
                            logData={displayPriceHistory}
                            logCounts={priceHistoryCounts}
                            onExport={() => {}} 
                            onFetchPrices={() => {}} 
                        />
                        <BotStrategy />
                    </div>
                </div>
            </main>
            <Terminal logs={terminalLog} onExport={() => {}} />
        </div>
    );
};

export default App;
