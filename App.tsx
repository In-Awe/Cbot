
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
import type { StrategyConfig, Signal, Trade, AnalysisLogEntry, TerminalLogEntry, SimulationStatus, PriceHistoryLogEntry, PredictionAccuracyRecord } from './types';
import { generateTradingSignals } from './services/geminiService';
import { fetchLivePrices } from './services/binanceService';
import { DEFAULT_STRATEGY_CONFIG } from './constants';

const SIMULATION_INTERVAL = 60000; // 60 seconds
const PRICE_FETCH_INTERVAL = 15000; // 15 seconds

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

const App: React.FC = () => {
    const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
    const [signals, setSignals] = useState<Signal[]>([]);
    const [openTrades, setOpenTrades] = useState<Trade[]>(() => {
        const saved = localStorage.getItem('openTrades');
        return saved ? JSON.parse(saved) : [];
    });
    const [closedTrades, setClosedTrades] = useState<Trade[]>(() => {
        const saved = localStorage.getItem('closedTrades');
        return saved ? JSON.parse(saved) : [];
    });
    
    const [predictionRecords, setPredictionRecords] = useState<PredictionAccuracyRecord[]>([]);
    const [priceHistoryLog, setPriceHistoryLog] = useState<Record<string, PriceHistoryLogEntry[]>>(() => {
        const saved = localStorage.getItem('priceHistoryLogs');
        return saved ? JSON.parse(saved) : {};
    });
    const [livePrices, setLivePrices] = useState<Record<string, number>>({});

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [simulationStatus, setSimulationStatus] = useState<SimulationStatus>('stopped');
    const [analysisLog, setAnalysisLog] = useState<AnalysisLogEntry[]>([]);
    const [terminalLog, setTerminalLog] = useState<TerminalLogEntry[]>([]);
    const [geminiApiKey, setGeminiApiKey] = useState<string>('');
    const [binanceKeys, setBinanceKeys] = useState<{key: string, secret: string}>({key: '', secret: ''});
    const [isGeminiConnected, setIsGeminiConnected] = useState(false);
    const [isBinanceConnected, setIsBinanceConnected] = useState(false);

    const intervalRef = useRef<number | null>(null);
    const configRef = useRef(config);
    const geminiApiKeyRef = useRef(geminiApiKey);
    const isBinanceConnectedRef = useRef(isBinanceConnected);
    const openTradesRef = useRef(openTrades);
    const closedTradesRef = useRef(closedTrades);
    const terminalLogRef = useRef(terminalLog);
    const livePricesRef = useRef(livePrices);
    const isAnalysisRunning = useRef(false);

    useEffect(() => { configRef.current = config; }, [config]);
    useEffect(() => { geminiApiKeyRef.current = geminiApiKey; }, [geminiApiKey]);
    useEffect(() => { isBinanceConnectedRef.current = isBinanceConnected; }, [isBinanceConnected]);
    useEffect(() => { openTradesRef.current = openTrades; }, [openTrades]);
    useEffect(() => { closedTradesRef.current = closedTrades; }, [closedTrades]);
    useEffect(() => { terminalLogRef.current = terminalLog; }, [terminalLog]);
    useEffect(() => { livePricesRef.current = livePrices; }, [livePrices]);

    useEffect(() => { localStorage.setItem('openTrades', JSON.stringify(openTrades)); }, [openTrades]);
    useEffect(() => { localStorage.setItem('closedTrades', JSON.stringify(closedTrades)); }, [closedTrades]);
    useEffect(() => { localStorage.setItem('priceHistoryLogs', JSON.stringify(priceHistoryLog)); }, [priceHistoryLog]);


    const addLog = useCallback((message: string, type: TerminalLogEntry['type'] = 'info', data?: any) => {
        const newEntry: TerminalLogEntry = {
            id: Date.now() + Math.random(),
            timestamp: new Date(),
            message,
            type,
            data: data ? JSON.stringify(data, null, 2) : undefined,
        };
        setTerminalLog(prev => [newEntry, ...prev]);
    }, []);
    
    const prevConfig = usePrevious(config);
    useEffect(() => {
        if (prevConfig) {
            const changes: string[] = [];
            for (const key in config) {
                const typedKey = key as keyof StrategyConfig;
                if (JSON.stringify(config[typedKey]) !== JSON.stringify(prevConfig[typedKey])) {
                     changes.push(`${typedKey} changed to ${JSON.stringify(config[typedKey])}`);
                }
            }
            if (changes.length > 0) {
                addLog(`Strategy config updated: ${changes.join('; ')}`, 'info');
            }
        }
    }, [config, addLog]);

    const showNotification = useCallback((title: string, options: NotificationOptions & { pair?: string }) => {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const notification = new Notification(title, options);
        if (options.pair) {
            notification.onclick = () => {
                const pairUrl = `https://www.binance.com/en/trade/${options.pair?.replace('/', '_')}`;
                window.open(pairUrl, '_blank');
            };
        }
    }, []);
    
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    }, []);

    const closeTrade = useCallback((trade: Trade, exitPrice: number, reason: string) => {
        const tradeAmount = configRef.current.trade_amount_usd;
        let pnl = 0;
        if (trade.direction === 'LONG') {
            pnl = (exitPrice - trade.entryPrice) * (tradeAmount / trade.entryPrice);
        } else {
            pnl = (trade.entryPrice - exitPrice) * (tradeAmount / trade.entryPrice);
        }
        const closedTrade: Trade = { ...trade, status: 'closed', exitPrice, closedAt: new Date(), pnl };
        setClosedTrades(prev => [closedTrade, ...prev]);
        setOpenTrades(prev => prev.filter(t => t.id !== trade.id));
        const pnlString = pnl >= 0 ? `profit of $${pnl.toFixed(2)}` : `loss of $${Math.abs(pnl).toFixed(2)}`;
        showNotification(`Position Closed: ${trade.pair}`, { body: `${reason} for a ${pnlString}.`, pair: trade.pair, icon: '/vite.svg' });
        addLog(`Position for ${trade.pair} closed. Reason: ${reason}. PNL: $${pnl.toFixed(2)}`, 'info');
    }, [showNotification, addLog]);

    const getCheckInterval = (timeframe: string): number => {
        const unit = timeframe.slice(-1);
        const value = parseInt(timeframe.slice(0, -1));
        switch (unit) {
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            default: return 5 * 60 * 1000; // Default 5 mins
        }
    };
    
    const resolvePredictions = useCallback((currentPrices: Record<string, number>) => {
        setPredictionRecords(prevRecords => {
            const now = Date.now();
            return prevRecords.map(rec => {
                if (rec.status === 'pending' && (now - rec.predictionTime) > getCheckInterval(rec.timeframe)) {
                    const endPrice = currentPrices[rec.pair];
                    if (endPrice === undefined) return rec; // Can't resolve yet

                    const priceChange = endPrice - rec.startPrice;
                    const outcome = Math.abs(priceChange / rec.startPrice) < 0.0005 ? 'SIDEWAYS' // less than 0.05% change
                                   : priceChange > 0 ? 'UP' : 'DOWN';
                    
                    const success = (rec.predictedSignal === 'bull' && outcome === 'UP') || (rec.predictedSignal === 'bear' && outcome === 'DOWN');

                    return { ...rec, status: 'resolved', endTime: now, endPrice, outcome, success };
                }
                return rec;
            });
        });
    }, []);
    
    const fetchAndSetPrices = useCallback(async (): Promise<boolean> => {
        const currentConfig = configRef.current;
        if (!isBinanceConnectedRef.current || currentConfig.trading_pairs.length === 0) {
            setLivePrices({});
            return false;
        }

        try {
            // Passing an empty string for API key as it's not used by the proxied public endpoint
            const prices = await fetchLivePrices(currentConfig.trading_pairs, '');
            if (Object.keys(prices).length > 0) {
                setLivePrices(prices);
                setPriceHistoryLog(prev => {
                    const newLogs = { ...prev };
                    Object.entries(prices).forEach(([pair, price]) => {
                        const newEntry: PriceHistoryLogEntry = { id: Date.now() + Math.random(), timestamp: new Date(), pair, price };
                        const pairHistory = prev[pair] ? [newEntry, ...prev[pair]] : [newEntry];
                        newLogs[pair] = pairHistory.slice(0, 500);
                    });
                    return newLogs;
                });
                return true;
            }
             return false;
        } catch(e) {
            const error = e instanceof Error ? e.message : String(e);
            const lastLog = terminalLogRef.current[0];
            if (!lastLog || !lastLog.message.includes(error)) {
                addLog(`Failed to fetch prices from Binance: ${error}`, 'error');
            }
            setLivePrices({});
            return false;
        }
    }, [addLog]);

    useEffect(() => {
        if (isBinanceConnected) {
            fetchAndSetPrices();
            const priceInterval = setInterval(fetchAndSetPrices, PRICE_FETCH_INTERVAL);
            return () => clearInterval(priceInterval);
        } else {
            setLivePrices({});
        }
    }, [isBinanceConnected, fetchAndSetPrices]);

    const runAnalysis = useCallback(async (isManualReport = false) => {
        if (isAnalysisRunning.current) {
            addLog('Analysis already in progress, skipping tick.', 'warn');
            return;
        }
        isAnalysisRunning.current = true;

        const currentConfig = configRef.current;
        const currentGeminiApiKey = geminiApiKeyRef.current;

        if (!currentGeminiApiKey || !isBinanceConnectedRef.current) {
            setError('Both Gemini and Binance must be connected to run the simulation.');
            setSimulationStatus('stopped');
            addLog('Simulation stopped: API connections incomplete.', 'error');
            isAnalysisRunning.current = false;
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            // 1. Get live prices from the state, which is updated independently
            const currentPrices = livePricesRef.current;
            if (Object.keys(currentPrices).length === 0) {
                 throw new Error("Live prices are not available. Check Binance connection or trading pairs.");
            }

            // 2. Resolve any pending prediction accuracy records
            resolvePredictions(currentPrices);

            // 3. Generate signals from Gemini
            addLog('Requesting new signals from Gemini API...', 'request', { pairs: currentConfig.trading_pairs });
            const generatedSignals = await generateTradingSignals(currentConfig, currentGeminiApiKey, closedTradesRef.current, currentPrices, priceHistoryLog);
            addLog('Received response from Gemini API.', 'response', generatedSignals);
            
            const signalsWithLivePrices = generatedSignals.map(signal => ({ ...signal, last_price: currentPrices[signal.pair] || signal.last_price }));
            setSignals(signalsWithLivePrices);

            // 4. Create new prediction records
            const newPredictionRecords: PredictionAccuracyRecord[] = [];
            signalsWithLivePrices.forEach(signal => {
                signal.meta.forEach(m => {
                    if ((m.signal === 'bull' || m.signal === 'bear') && signal.last_price) {
                        newPredictionRecords.push({
                            id: `${signal.pair}-${m.timeframe}-${m.signal}-${Date.now()}`,
                            pair: signal.pair,
                            timeframe: m.timeframe,
                            predictedSignal: m.signal,
                            predictionTime: Date.now(),
                            startPrice: signal.last_price,
                            status: 'pending'
                        });
                    }
                });
            });
            setPredictionRecords(prev => [...newPredictionRecords, ...prev]);
            
            // 5. Check trades, notifications, and logs
            const signalsMap = new Map(signalsWithLivePrices.map(s => [s.pair, s]));
            if (simulationStatus === 'running' && !isManualReport) {
                signalsWithLivePrices.forEach(signal => {
                    if (signal.action === 'buy' || signal.action === 'sell') {
                         showNotification(`${signal.action.toUpperCase()} Signal: ${signal.pair}`, {
                            body: `Price: $${signal.last_price?.toFixed(4)} | Confidence: ${Math.round(signal.confidence * 100)}%`, icon: '/vite.svg', pair: signal.pair,
                        });
                    }
                });

                for (const trade of openTradesRef.current.filter(t => t.status === 'active')) {
                    const currentPrice = currentPrices[trade.pair];
                    if (!currentPrice) continue;
                    addLog(`Checking active trade ${trade.pair}: Current Price: $${currentPrice.toFixed(4)}, TP: $${trade.takeProfit.toFixed(4)}, SL: $${trade.stopLoss.toFixed(4)}`, 'info');
                    if (trade.direction === 'LONG') {
                        if (currentPrice >= trade.takeProfit) closeTrade(trade, trade.takeProfit, 'Take Profit hit');
                        else if (currentPrice <= trade.stopLoss) closeTrade(trade, trade.stopLoss, 'Stop Loss hit');
                    } else { // SHORT
                        if (currentPrice <= trade.takeProfit) closeTrade(trade, trade.takeProfit, 'Take Profit hit');
                        else if (currentPrice >= trade.stopLoss) closeTrade(trade, trade.stopLoss, 'Stop Loss hit');
                    }
                }
            }

            const newLogEntries: AnalysisLogEntry[] = signalsWithLivePrices.map(signal => ({
                id: `${signal.pair}-${Date.now()}`,
                timestamp: new Date(),
                pair: signal.pair,
                price: signal.last_price || 0,
                action: signal.action,
                confidence: signal.confidence,
                meta: signal.meta,
            }));
            setAnalysisLog(prev => [...newLogEntries, ...prev]);

        } catch (e) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            const fullError = `Analysis Error: ${errorMessage}`;
            setError(fullError);
            addLog(fullError, 'error');
            if (simulationStatus === 'running') {
                 setSimulationStatus('paused');
                 setError('Simulation paused due to an error. Check terminal for details.');
            }
        } finally {
            setIsLoading(false);
            isAnalysisRunning.current = false;
        }
    }, [addLog, showNotification, closeTrade, simulationStatus, resolvePredictions, priceHistoryLog]);
    
    const handleManualPriceFetch = async () => {
        if (!isBinanceConnected) {
            alert("Please connect to Binance first.");
            return;
        }
        addLog('Manually fetching live prices...', 'request');
        const success = await fetchAndSetPrices();
        if (success) {
            addLog('Manual price fetch successful.', 'info');
        } else {
            addLog('Manual price fetch failed. Check logs for errors.', 'warn');
        }
    };

    const handleGeminiConnect = useCallback((apiKey: string) => {
        setGeminiApiKey(apiKey);
        setIsGeminiConnected(true);
        addLog('Gemini API Connected.', 'info');
    }, [addLog]);

    const handleBinanceConnect = useCallback((key: string, secret: string) => {
        setBinanceKeys({ key, secret });
        setIsBinanceConnected(true);
        addLog('Binance API Connected. Starting live price feed.', 'info');
    }, [addLog]);

    const handleGeminiDisconnect = useCallback(() => {
        if (simulationStatus !== 'stopped') {
            addLog('Simulation stopped due to Gemini API disconnection.', 'warn');
        }
        setSimulationStatus('stopped');
        setGeminiApiKey('');
        setIsGeminiConnected(false);
        setSignals([]);
        addLog('Gemini API Disconnected.', 'info');
    }, [addLog, simulationStatus]);
    
    const handleBinanceDisconnect = useCallback(() => {
        if (simulationStatus !== 'stopped') {
            addLog('Simulation stopped due to Binance API disconnection.', 'warn');
        }
        setSimulationStatus('stopped');
        setBinanceKeys({key: '', secret: ''});
        setIsBinanceConnected(false);
        setLivePrices({});
        setSignals([]);
        setPriceHistoryLog({});
        addLog('Binance API Disconnected. Price feed stopped.', 'info');
    }, [addLog, simulationStatus]);
    
    const handlePlay = () => { addLog('Simulation starting...', 'info'); setSimulationStatus('running'); runAnalysis(); };
    const handlePause = () => { addLog('Simulation paused.', 'info'); setSimulationStatus('paused'); };
    const handleStop = () => { addLog('Simulation stopped.', 'info'); setSimulationStatus('stopped'); setSignals([]); setAnalysisLog([]); }

    useEffect(() => {
        if (simulationStatus === 'running') {
            intervalRef.current = window.setInterval(() => runAnalysis(false), SIMULATION_INTERVAL);
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [simulationStatus, runAnalysis]);

    const handleOpenTimeframeTrade = useCallback((pair: string, direction: 'LONG' | 'SHORT') => {
        const signal = signals.find(s => s.pair === pair);
        if (!signal || !signal.last_price || !signal.take_profit || !signal.stop_loss) return alert("Signal data incomplete.");
        if (openTradesRef.current.length >= configRef.current.max_concurrent_trades) return alert("Max concurrent trades reached.");
        if (openTradesRef.current.some(trade => trade.pair === signal.pair)) return alert("Trade for this pair already open.");
        
        const newTrade: Trade = {
            id: `${signal.pair}-${Date.now()}`, pair: signal.pair, direction: direction, entryPrice: signal.last_price,
            openedAt: new Date(), takeProfit: signal.take_profit, stopLoss: signal.stop_loss, status: 'pending',
            initialConfidence: signal.confidence, initialSignalMeta: signal.meta,
        };
        setOpenTrades(prev => [newTrade, ...prev]);
        addLog(`Position for ${signal.pair} (${direction}) opened with status 'pending'.`, 'info');
    }, [signals, addLog]);
    
    const handleConfirmTrade = useCallback((tradeId: string) => {
        setOpenTrades(prev => prev.map(t => t.id === tradeId ? { ...t, status: 'active' } : t));
        const trade = openTrades.find(t=>t.id === tradeId);
        if(trade) addLog(`Confirmed trade for ${trade.pair}. Position active.`, 'info');
    }, [addLog, openTrades]);

    const handleUpdateTrade = useCallback((tradeId: string, updates: Partial<Pick<Trade, 'entryPrice' | 'takeProfit' | 'stopLoss'>>) => {
        setOpenTrades(prev => prev.map(t => t.id === tradeId ? { ...t, ...updates } : t));
        const trade = openTrades.find(t=>t.id === tradeId);
        if(trade) addLog(`Updated trade params for ${trade.pair}.`, 'info', updates);
    }, [addLog, openTrades]);

    const handleCloseTrade = useCallback((tradeId: string) => {
        const trade = openTradesRef.current.find(t => t.id === tradeId);
        if(trade){
            const signal = signals.find(s => s.pair === trade.pair);
            closeTrade(trade, signal?.last_price || trade.entryPrice, 'Manual close');
        }
    }, [signals, closeTrade]);
    
    const arrayToCsv = (data: any[], columns: {key: string, label: string}[]) => {
        if (data.length === 0) return '';
        const header = columns.map(c => c.label).join(',');
        const rows = data.map(row => 
            columns.map(col => {
                let cell = row[col.key];
                if (typeof cell === 'object' && cell !== null) cell = JSON.stringify(cell);
                if (cell === null || cell === undefined) return '';
                if (cell instanceof Date) return cell.toISOString();
                let cellStr = String(cell);
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    cellStr = `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            }).join(',')
        );
        return [header, ...rows].join('\n');
    }

    const downloadCsv = (csvString: string, filename: string) => {
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    const handleExportAnalysisLog = useCallback(() => {
        const columns = [ { key: 'timestamp', label: 'Timestamp' }, { key: 'pair', label: 'Pair' }, { key: 'price', label: 'Price' }, { key: 'action', label: 'Action' }, { key: 'confidence', label: 'Confidence' }, { key: 'meta', label: 'Timeframe Analysis (JSON)' }, ];
        downloadCsv(arrayToCsv(analysisLog, columns), `analysis-log-${new Date().toISOString().slice(0,10)}.csv`);
    }, [analysisLog]);

    const handleExportTerminalLog = useCallback(() => {
        const columns = [ { key: 'timestamp', label: 'Timestamp' }, { key: 'type', label: 'Type' }, { key: 'message', label: 'Message' }, { key: 'data', label: 'Data (JSON)' }, ];
        const logsToExport = [...terminalLog].reverse();
        downloadCsv(arrayToCsv(logsToExport.map(({ id, ...rest }) => rest), columns), `terminal-log-${new Date().toISOString().slice(0,10)}.csv`);
    }, [terminalLog]);
    
    const handleExportPriceHistory = useCallback((pair: string) => {
        const logToExport = priceHistoryLog[pair];
        if (!logToExport || logToExport.length === 0) {
            alert(`No price history available to export for ${pair}.`);
            return;
        }
        const columns = [ { key: 'timestamp', label: 'Timestamp' }, { key: 'pair', label: 'Pair' }, { key: 'price', label: 'Price' } ];
        const reversedLog = [...logToExport].reverse();
        const filename = `price-history-${pair.replace('/', '_')}-${new Date().toISOString().slice(0,10)}.csv`;
        downloadCsv(arrayToCsv(reversedLog, columns), filename);
    }, [priceHistoryLog]);
    
    const handleExportPredictionAccuracy = useCallback(() => {
         const columns = [
            { key: 'predictionTime', label: 'PredictionTime' },
            { key: 'pair', label: 'Pair' },
            { key: 'timeframe', label: 'Timeframe' },
            { key: 'predictedSignal', label: 'Prediction' },
            { key: 'startPrice', label: 'StartPrice' },
            { key: 'status', label: 'Status' },
            { key: 'endTime', label: 'EndTime' },
            { key: 'endPrice', label: 'EndPrice' },
            { key: 'outcome', label: 'Outcome' },
            { key: 'success', label: 'Success' },
        ];
        const data = predictionRecords.map(r => ({ ...r, predictionTime: new Date(r.predictionTime).toISOString(), endTime: r.endTime ? new Date(r.endTime).toISOString() : '' }));
        downloadCsv(arrayToCsv(data, columns), `prediction-accuracy-report-${new Date().toISOString().slice(0,10)}.csv`);
    }, [predictionRecords]);


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
                            onGeminiConnect={handleGeminiConnect}
                            onBinanceConnect={handleBinanceConnect}
                            onGeminiDisconnect={handleGeminiDisconnect}
                            onBinanceDisconnect={handleBinanceDisconnect}
                        />
                        <SimulationControl
                            status={simulationStatus}
                            onPlay={handlePlay}
                            onPause={handlePause}
                            onStop={handleStop}
                            onAdvance={() => runAnalysis(false)}
                            isDisabled={!isGeminiConnected || !isBinanceConnected || isLoading}
                        />
                        <LivePrices prices={livePrices} trading_pairs={config.trading_pairs} />
                        <ControlPanel
                            initialConfig={config}
                            onConfigChange={setConfig}
                            onAnalyze={handleExportPredictionAccuracy}
                            isLoading={isLoading && simulationStatus === 'stopped'}
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
                            signals={signals}
                            isLoading={isLoading && signals.length === 0}
                            onOpenTimeframeTrade={handleOpenTimeframeTrade}
                            openTradePairs={openTrades.map(t => t.pair)}
                            tradeAmountUSD={config.trade_amount_usd}
                        />
                        <OpenPositions openTrades={openTrades} closedTrades={closedTrades} onCloseTrade={handleCloseTrade} onConfirmTrade={handleConfirmTrade} onUpdateTrade={handleUpdateTrade} />
                        <PredictionAccuracy records={predictionRecords} />
                        <AnalysisLog logEntries={analysisLog} onExport={handleExportAnalysisLog} />
                        <PriceHistoryLog 
                            trading_pairs={config.trading_pairs}
                            logData={priceHistoryLog} 
                            onExport={handleExportPriceHistory} 
                            onFetchPrices={handleManualPriceFetch} 
                        />
                    </div>
                </div>
            </main>
            <Terminal logs={terminalLog} onExport={handleExportTerminalLog} />
        </div>
    );
};

export default App;
