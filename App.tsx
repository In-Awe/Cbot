
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
import type { StrategyConfig, Signal, Trade, AnalysisLogEntry, TerminalLogEntry, SimulationStatus, PriceHistoryLogEntry, PredictionAccuracyRecord, AnalysisEngine } from './types';
import { generateTradingSignals, constructGeminiPrompt } from './services/geminiService';
import { runBotAnalysis } from './services/botService';
import { fetchKlinesSince, resampleKlinesTo15sCandles, fetchHistorical1mKlines, fetchHistoricalHighResCandles } from './services/binanceService';
import { addPriceHistory, getPriceHistory, getFullPriceHistory, getHistoryCounts, initDBForPairs, getLatestEntryTimestamp } from './services/dbService';
import { DEFAULT_STRATEGY_CONFIG } from './constants';

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

    const [isManualAnalysisModalOpen, setIsManualAnalysisModalOpen] = useState(false);
    const [manualAnalysisPrompt, setManualAnalysisPrompt] = useState('');

    const intervalRef = useRef<number | null>(null);
    const priceFetchIntervalRef = useRef<number | null>(null);
    const configRef = useRef(config);
    const isBinanceConnectedRef = useRef(isBinanceConnected);
    const isAnalysisRunning = useRef(false);
    const isBacktestRunningRef = useRef(false);
    const livePricesRef = useRef(livePrices);
    const lastFetchTimestampsRef = useRef<Record<string, number>>({});

    useEffect(() => { configRef.current = config; }, [config]);
    useEffect(() => { isBinanceConnectedRef.current = isBinanceConnected; }, [isBinanceConnected]);
    useEffect(() => { livePricesRef.current = livePrices; }, [livePrices]);
    useEffect(() => { localStorage.setItem('openTrades', JSON.stringify(openTrades)); }, [openTrades]);
    useEffect(() => { localStorage.setItem('closedTrades', JSON.stringify(closedTrades)); }, [closedTrades]);

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
            if (changes.length > 0) addLog(`Strategy config updated: ${changes.join('; ')}`, 'info');
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
        const tradeAmount = trade.tradeAmountUSD;
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
    
    const resolvePredictions = useCallback((currentPrices: Record<string, PriceHistoryLogEntry | undefined>) => {
        setPredictionRecords(prevRecords => {
            const now = Date.now();
            return prevRecords.map(rec => {
                if (rec.status === 'pending' && (now - rec.predictionTime) > getCheckInterval(rec.timeframe)) {
                    const endPrice = currentPrices[rec.pair]?.close;
                    if (endPrice === undefined) return rec; 

                    const priceChange = endPrice - rec.startPrice;
                    const outcome = Math.abs(priceChange / rec.startPrice) < 0.0005 ? 'SIDEWAYS'
                                   : priceChange > 0 ? 'UP' : 'DOWN';
                    
                    const success = (rec.predictedSignal === 'bull' && outcome === 'UP') || (rec.predictedSignal === 'bear' && outcome === 'DOWN');

                    return { ...rec, status: 'resolved', endTime: now, endPrice, outcome, success };
                }
                return rec;
            });
        });
    }, []);

    const handleConfirmTrade = useCallback((tradeId: string) => {
        setOpenTrades(prevOpenTrades => {
            const tradeToConfirm = prevOpenTrades.find(t => t.id === tradeId);
            if (tradeToConfirm) {
                addLog(`Confirmed trade for ${tradeToConfirm.pair}. Position active.`, 'info');
                return prevOpenTrades.map(t => t.id === tradeId ? { ...t, status: 'active' } : t);
            }
            return prevOpenTrades;
        });
    }, [addLog]);

    const handleOpenTimeframeTrade = useCallback((pair: string, direction: 'LONG' | 'SHORT') => {
        const signal = signals.find(s => s.pair === pair);
        if (!signal || !signal.last_price || !signal.take_profit || !signal.stop_loss || !signal.betSizeUSD) {
             alert("Signal data incomplete for trading.");
             return;
        }
        if (openTrades.length >= config.max_concurrent_trades) return alert("Max concurrent trades reached.");
        if (openTrades.some(trade => trade.pair === signal.pair)) return alert("Trade for this pair already open.");
        
        const newTrade: Trade = {
            id: `${signal.pair}-${Date.now()}`, pair: signal.pair, direction: direction, entryPrice: signal.last_price,
            openedAt: new Date(), takeProfit: signal.take_profit, stopLoss: signal.stop_loss, status: 'pending',
            tradeAmountUSD: signal.betSizeUSD,
            initialConfidence: signal.confidence, initialSignalMeta: signal.meta,
        };
        setOpenTrades(prev => [newTrade, ...prev]);
        addLog(`Position for ${signal.pair} (${direction}) of $${signal.betSizeUSD?.toFixed(2)} opened with status 'pending'.`, 'info');
        if (simulationStatus === 'running' && analysisEngine === 'internal') {
           handleConfirmTrade(newTrade.id);
        }
    }, [signals, addLog, openTrades, config.max_concurrent_trades, simulationStatus, analysisEngine, handleConfirmTrade]);

    const processSignalsAndUpdateState = useCallback((generatedSignals: Signal[], currentSimStatus: SimulationStatus) => {
        const currentPrices = livePricesRef.current;
        addLog('Processing generated signals...', 'info', generatedSignals);

        const signalsWithLivePrices = generatedSignals.map(signal => ({ ...signal, last_price: currentPrices[signal.pair]?.close || signal.last_price }));
        setSignals(signalsWithLivePrices);

        const newPredictionRecords: PredictionAccuracyRecord[] = [];
        signalsWithLivePrices.forEach(signal => {
            signal.meta.forEach(m => {
                if ((m.signal === 'bull' || m.signal === 'bear') && signal.last_price) {
                    newPredictionRecords.push({
                        id: `${signal.pair}-${m.timeframe}-${m.signal}-${Date.now()}`,
                        pair: signal.pair,
                        timeframe: m.timeframe,
                        predictedSignal: m.signal as 'bull' | 'bear',
                        predictionTime: Date.now(),
                        startPrice: signal.last_price,
                        status: 'pending'
                    });
                }
            });
        });
        setPredictionRecords(prev => [...newPredictionRecords, ...prev]);
        
        // Auto-trading logic, only executes when status is 'running'
        if (currentSimStatus === 'running') {
            signalsWithLivePrices.forEach(signal => {
                const isTradeOpen = openTrades.some(t => t.pair === signal.pair && t.status === 'active');
                if (!isTradeOpen && (signal.action === 'buy' || signal.action === 'sell') && signal.confidence > 0.75) {
                    const direction = signal.action === 'buy' ? 'LONG' : 'SHORT';
                    handleOpenTimeframeTrade(signal.pair, direction);
                    showNotification(`${signal.action.toUpperCase()} Signal: ${signal.pair}`, {
                        body: `Auto-opening trade for $${signal.betSizeUSD?.toFixed(2)}. Price: $${signal.last_price?.toFixed(4)} | Confidence: ${Math.round(signal.confidence * 100)}%`, icon: '/vite.svg', pair: signal.pair,
                    });
                }
            });
        }

        for (const trade of openTrades.filter(t => t.status === 'active')) {
            const currentPrice = currentPrices[trade.pair]?.close;
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

        const newLogEntries: AnalysisLogEntry[] = signalsWithLivePrices.map(signal => ({
            id: `${signal.pair}-${Date.now()}`,
            timestamp: new Date(),
            pair: signal.pair,
            price: signal.last_price || 0,
            action: signal.action,
            confidence: signal.confidence,
            meta: signal.meta,
        }));
        setAnalysisLog(prev => [...newLogEntries, ...prev.slice(0, 99)]);

    }, [addLog, showNotification, closeTrade, openTrades, handleOpenTimeframeTrade]);
    
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

    const runAnalysis = useCallback(async () => {
        if (isAnalysisRunning.current) {
            addLog('Analysis already in progress, skipping tick.', 'warn');
            return;
        }
        isAnalysisRunning.current = true;
        
        let currentSimStatus: SimulationStatus = 'stopped';
        setSimulationStatus(prev => {
            currentSimStatus = prev;
            return prev;
        });

        if ((analysisEngine === 'gemini' && !geminiApiKey) || !isBinanceConnectedRef.current) {
            setError('Both Gemini (if selected) and Binance must be connected to run the simulation.');
            setSimulationStatus('stopped');
            isAnalysisRunning.current = false;
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const currentPrices = livePricesRef.current;
            if (Object.values(currentPrices).every(p => p === undefined)) {
                 throw new Error("Live prices are not available. Check Binance connection or trading pairs.");
            }
            resolvePredictions(currentPrices);
            
            const fullPriceHistory: Record<string, PriceHistoryLogEntry[]> = Object.fromEntries(
                await Promise.all(config.trading_pairs.map(async pair => [pair, await getFullPriceHistory(pair)]))
            );

            let generatedSignals: Signal[] = [];

            if (analysisEngine === 'gemini') {
                addLog('Sending analysis request to Gemini API with summarized historical data...', 'request', {
                    pairs: config.trading_pairs,
                    history_summary: Object.fromEntries(Object.entries(fullPriceHistory).map(([p,h]) => [p, `${h.length} records`])),
                });

                const livePricesForPrompt = Object.fromEntries(
                    Object.entries(currentPrices)
                    .filter(([, value]) => value !== undefined)
                    .map(([key, value]) => [key, value!.close])
                );

                generatedSignals = await generateTradingSignals(config, geminiApiKey, closedTrades, livePricesForPrompt, fullPriceHistory);

            } else { // Internal Bot
                addLog('Running internal bot analysis...', 'request');
                const signals = await Promise.all(config.trading_pairs.map(async (pair) => {
                    const history = fullPriceHistory[pair];
                    const livePrice = currentPrices[pair];
                    if (!history || !livePrice) return null;
                    return runBotAnalysis(pair, history, config, livePrice);
                }));
                generatedSignals = signals.filter((s): s is Signal => s !== null);
            }
            
            processSignalsAndUpdateState(generatedSignals, currentSimStatus);

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            const fullError = `Analysis Error: ${errorMessage}`;
            setError(fullError);
            addLog(fullError, 'error');
            if (currentSimStatus !== 'stopped') setSimulationStatus('paused');
        } finally {
            setIsLoading(false);
            isAnalysisRunning.current = false;
        }
    }, [addLog, resolvePredictions, processSignalsAndUpdateState, analysisEngine, geminiApiKey, config, closedTrades]);
    
    const handleRunBacktest = useCallback(async () => {
        if (isBacktestRunningRef.current) return;

        // 1. Setup
        setSignals([]);
        setOpenTrades([]);
        setClosedTrades([]);
        setAnalysisLog([]);
        setPredictionRecords([]);
        setBacktestProgress(0);
        setError(null);
        setSimulationStatus('backtesting');
        isBacktestRunningRef.current = true;
        addLog('Starting historical simulation...', 'request');

        try {
            const pairs = configRef.current.trading_pairs;
            let backtestClosedTrades: Trade[] = [];
            let backtestAnalysisLog: AnalysisLogEntry[] = [];
            let backtestPredictionRecords: PredictionAccuracyRecord[] = [];
            let totalCandles = 0;
            let processedCandles = 0;

            const allPairHistories: { pair: string, history: PriceHistoryLogEntry[] }[] = [];
            for (const pair of pairs) {
                const history = (await getFullPriceHistory(pair, '1m')).sort((a,b) => a.id - b.id);
                 if (history.length < 101) {
                    addLog(`Not enough 1m history for ${pair} (${history.length} candles), skipping backtest.`, 'warn');
                    continue;
                }
                allPairHistories.push({ pair, history });
                totalCandles += history.length - 100;
            }

            if (allPairHistories.length === 0) {
                throw new Error("No pairs have sufficient historical data to run a backtest.");
            }

            for (const { pair, history } of allPairHistories) {
                let openTrade: Trade | null = null;

                for (let i = 100; i < history.length; i++) {
                    if (!isBacktestRunningRef.current) break;
                    
                    const historySlice = history.slice(0, i + 1);
                    const currentCandle = history[i];

                    if (openTrade) {
                        const { direction, entryPrice, takeProfit, stopLoss } = openTrade;
                        let exitPrice: number | null = null;
                        let reason: string | null = null;

                        if (direction === 'LONG') {
                            if (currentCandle.high >= takeProfit) { exitPrice = takeProfit; reason = 'Take Profit hit'; }
                            else if (currentCandle.low <= stopLoss) { exitPrice = stopLoss; reason = 'Stop Loss hit'; }
                        } else { // SHORT
                            if (currentCandle.low <= takeProfit) { exitPrice = takeProfit; reason = 'Take Profit hit'; }
                            else if (currentCandle.high >= stopLoss) { exitPrice = stopLoss; reason = 'Stop Loss hit'; }
                        }

                        if (exitPrice && reason) {
                            const pnl = direction === 'LONG' ? (exitPrice - entryPrice) * (openTrade.tradeAmountUSD / entryPrice) : (entryPrice - exitPrice) * (openTrade.tradeAmountUSD / entryPrice);
                            backtestClosedTrades.push({ ...openTrade, status: 'closed', exitPrice, closedAt: currentCandle.timestamp, pnl });
                            openTrade = null;
                        }
                    }

                    const signalResult = runBotAnalysis(pair, historySlice, configRef.current, null);
                    if (signalResult) {
                        backtestAnalysisLog.push({ id: `${pair}-${currentCandle.id}`, timestamp: currentCandle.timestamp, pair, price: currentCandle.close, action: signalResult.action, confidence: signalResult.confidence, meta: signalResult.meta });
                        
                        if ((signalResult.action === 'buy' || signalResult.action === 'sell') && signalResult.last_price && !openTrade) {
                            openTrade = { id: `${pair}-${currentCandle.id}`, pair, direction: signalResult.action === 'buy' ? 'LONG' : 'SHORT', entryPrice: signalResult.last_price, openedAt: currentCandle.timestamp, takeProfit: signalResult.take_profit!, stopLoss: signalResult.stop_loss!, status: 'active', tradeAmountUSD: signalResult.betSizeUSD! };
                        }
                    }
                    processedCandles++;
                    if(i % 50 === 0) {
                        setBacktestProgress( (processedCandles / totalCandles) * 100 );
                        await new Promise(res => setTimeout(res, 0)); // Yield to main thread
                    }
                }
                if (!isBacktestRunningRef.current) break;
                if (openTrade) {
                    const lastPrice = history[history.length-1].close;
                    const pnl = openTrade.direction === 'LONG' ? (lastPrice - openTrade.entryPrice) * (openTrade.tradeAmountUSD / openTrade.entryPrice) : (openTrade.entryPrice - lastPrice) * (openTrade.tradeAmountUSD / openTrade.entryPrice);
                    backtestClosedTrades.push({ ...openTrade, status: 'closed', exitPrice: lastPrice, closedAt: history[history.length-1].timestamp, pnl });
                }
            }

            if(isBacktestRunningRef.current) {
                setAnalysisLog(backtestAnalysisLog);
                setClosedTrades(backtestClosedTrades);
                setOpenTrades([]);
                setSimulationStatus('backtest_complete');
                setBacktestProgress(100);
                addLog(`Backtest complete. Generated ${backtestClosedTrades.length} trades.`, 'info');
            } else {
                 addLog('Backtest stopped by user.', 'warn');
                 setSimulationStatus('stopped');
            }

        } catch(e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Backtest Error: ${errorMessage}`);
            addLog(`Backtest Error: ${errorMessage}`, 'error');
            setSimulationStatus('stopped');
        } finally {
            isBacktestRunningRef.current = false;
        }

    }, [addLog]);


    const handleManualPriceFetch = async () => {
        if (!isBinanceConnected) return alert("Please connect to Binance first.");
        addLog('Manually fetching live prices...', 'request');
        await fetchAndStoreLiveCandles();
    };

    const handleGeminiConnect = useCallback((apiKey: string) => {
        setGeminiApiKey(apiKey);
        setIsGeminiConnected(true);
        addLog('Gemini API Connected.', 'info');
    }, [addLog]);

    const handleBinanceConnect = useCallback(async (key: string, secret: string) => {
        setIsBinanceConnected(true);
        addLog('Binance API Connected. Starting live price feed.', 'info');
        
        try {
            await initDBForPairs(configRef.current.trading_pairs);

            for (const pair of configRef.current.trading_pairs) {
                addLog(`Backfilling historical data for ${pair}... This may take a few minutes.`, 'request');
                
                // Fetch 30 hours of 1-minute data to satisfy bot requirements
                addLog(`[${pair}] Fetching 30 hours of 1-minute k-lines...`, 'info');
                const klines1m = await fetchHistorical1mKlines(pair, 30);
                await addPriceHistory(pair, klines1m);
                addLog(`[${pair}] Stored ${klines1m.length} 1-minute k-lines.`, 'info');
                
                // Fetch 4 hours of high-resolution 15-second candles
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
    
    const handleClearTimers = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
    };

    const handleGeminiDisconnect = useCallback(() => {
        if (simulationStatus !== 'stopped') addLog('Simulation stopped due to Gemini API disconnection.', 'warn');
        handleClearTimers();
        setSimulationStatus('stopped');
        setGeminiApiKey('');
        setIsGeminiConnected(false);
        setSignals([]);
        addLog('Gemini API Disconnected.', 'info');
    }, [addLog, simulationStatus]);
    
    const handleBinanceDisconnect = useCallback(() => {
        if (simulationStatus !== 'stopped') addLog('Simulation stopped due to Binance API disconnection.', 'warn');
        handleClearTimers();
        setSimulationStatus('stopped');
        setIsBinanceConnected(false);
        setLivePrices({});
        setSignals([]);
        addLog('Binance API Disconnected. Price feed stopped.', 'info');
    }, [addLog, simulationStatus]);
    
    const handlePlay = () => {
        addLog('Simulation starting... Performing initial analysis on historical data.', 'info');
        setSignals([]);
        setOpenTrades([]);
        setClosedTrades([]);
        setAnalysisLog([]);
        setPredictionRecords([]);
        setError(null);
        setSimulationStatus('warming up');

        const initializeSimulation = async () => {
            try {
                // The first runAnalysis uses all historical data to prime the bot
                await runAnalysis();
                
                // Transition to running only if the user hasn't stopped it
                setSimulationStatus(currentStatus => {
                    if (currentStatus === 'warming up') {
                        addLog('Initial analysis complete. Live simulation is now running.', 'info');
                        return 'running';
                    }
                    return currentStatus; // Respect if user hit stop/pause
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                addLog(`Error during simulation initialization: ${errorMessage}`, 'error');
                setError(`Failed to start simulation: ${errorMessage}`);
                setSimulationStatus('stopped');
            }
        };

        initializeSimulation();
    };
    const handlePause = () => { addLog('Simulation paused.', 'info'); setSimulationStatus('paused'); handleClearTimers(); };
    const handleStop = () => {
        if (isBacktestRunningRef.current) {
            isBacktestRunningRef.current = false; // This will signal the loop to stop
        } else {
            addLog('Simulation stopped.', 'info');
            setSimulationStatus('stopped');
            setSignals([]);
            setAnalysisLog([]);
            handleClearTimers();
        }
    };

    useEffect(() => {
        if (simulationStatus === 'running') {
            intervalRef.current = window.setInterval(() => runAnalysis(), PRICE_FETCH_INTERVAL);
        } else {
            handleClearTimers();
        }
        return () => handleClearTimers();
    }, [simulationStatus, runAnalysis]);

    const handleTriggerManualAnalysis = async () => {
        if (!isBinanceConnectedRef.current) {
            addLog('Cannot trigger manual analysis: Binance not connected.', 'error');
            return;
        }
        addLog('Generating prompt with full history for manual analysis...', 'request');
        
        const fullPriceHistory = await Object.fromEntries(
            await Promise.all(config.trading_pairs.map(async pair => [pair, await getFullPriceHistory(pair)]))
        );

        const livePricesForPrompt = Object.fromEntries(
            Object.entries(livePrices)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, value!.close])
        );

        const prompt = constructGeminiPrompt(config, closedTrades, livePricesForPrompt, fullPriceHistory);
        setManualAnalysisPrompt(prompt);
        setIsManualAnalysisModalOpen(true);
    };
    
    const handleSubmitManualAnalysis = (responseText: string) => {
        setIsManualAnalysisModalOpen(false);
        addLog('Processing manually entered chatbot response...', 'info');
        setIsLoading(true);
        setError(null);
        try {
            let cleanResponse = responseText.trim();
            const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
            const match = cleanResponse.match(jsonRegex);
            if (match && match[1]) cleanResponse = match[1];
            
            const parsedData: unknown = JSON.parse(cleanResponse);
            if (Array.isArray(parsedData)) {
                processSignalsAndUpdateState(parsedData as Signal[], 'stopped');
            } else {
                throw new Error("Manual analysis response must be a JSON array.");
            }
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            addLog(`Failed to process manual analysis: ${error}`, 'error', { rawResponse: responseText });
            setError(`Failed to process manual analysis: ${error}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateTrade = useCallback((tradeId: string, updates: Partial<Pick<Trade, 'entryPrice' | 'takeProfit' | 'stopLoss'>>) => {
        setOpenTrades(prev => prev.map(t => t.id === tradeId ? { ...t, ...updates } : t));
        const trade = openTrades.find(t=>t.id === tradeId);
        if(trade) addLog(`Updated trade params for ${trade.pair}.`, 'info', updates);
    }, [addLog, openTrades]);

    const handleCloseTrade = useCallback((tradeId: string) => {
        const trade = openTrades.find(t => t.id === tradeId);
        if(trade) closeTrade(trade, livePrices[trade.pair]?.close || trade.entryPrice, 'Manual close');
    }, [openTrades, closeTrade, livePrices]);
    
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
    
    const handleExportPriceHistory = useCallback(async (pair: string, interval: '1m' | '15s') => {
        addLog(`Exporting full ${interval} price history for ${pair}...`, 'request');
        const fullHistory = await getFullPriceHistory(pair, interval);
        if (!fullHistory || fullHistory.length === 0) {
            return alert(`No ${interval} price history available to export for ${pair}.`);
        }
        const columns = [ { key: 'timestamp', label: 'Timestamp' }, { key: 'pair', label: 'Pair' }, { key: 'open', label: 'Open' }, { key: 'high', label: 'High' }, { key: 'low', label: 'Low' }, { key: 'close', label: 'Close' }, { key: 'volume', label: 'Volume' }, { key: 'interval', label: 'Interval'} ];
        const filename = `price-history-${pair.replace('/', '_')}-${interval}-${new Date().toISOString().slice(0,10)}.csv`;
        downloadCsv(arrayToCsv(fullHistory, columns), filename);
        addLog(`Successfully exported ${fullHistory.length} records for ${pair} (${interval}).`, 'info');
    }, [addLog]);
    
    const handleExportPredictionAccuracy = useCallback(() => {
         const columns = [ { key: 'predictionTime', label: 'PredictionTime' }, { key: 'pair', label: 'Pair' }, { key: 'timeframe', label: 'Timeframe' }, { key: 'predictedSignal', label: 'Prediction' }, { key: 'startPrice', label: 'StartPrice' }, { key: 'status', label: 'Status' }, { key: 'endTime', label: 'EndTime' }, { key: 'endPrice', label: 'EndPrice' }, { key: 'outcome', label: 'Outcome' }, { key: 'success', label: 'Success' }, ];
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
                            analysisEngine={analysisEngine}
                            onPlay={handlePlay}
                            onPause={handlePause}
                            onStop={handleStop}
                            onAdvance={() => runAnalysis()}
                            onManualAnalysis={handleTriggerManualAnalysis}
                            onEngineChange={setAnalysisEngine}
                            onRunBacktest={handleRunBacktest}
                            backtestProgress={backtestProgress}
                            isDisabled={!isBinanceConnected || (analysisEngine === 'gemini' && !isGeminiConnected)}
                            isManualDisabled={!isBinanceConnected || isLoading || !isGeminiConnected}
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
                        />
                        <OpenPositions openTrades={openTrades} closedTrades={closedTrades} onCloseTrade={handleCloseTrade} onConfirmTrade={handleConfirmTrade} onUpdateTrade={handleUpdateTrade} />
                        <PredictionAccuracy records={predictionRecords} />
                        <AnalysisLog logEntries={analysisLog} onExport={handleExportAnalysisLog} />
                        <PriceHistoryLog 
                            trading_pairs={config.trading_pairs}
                            logData={displayPriceHistory}
                            logCounts={priceHistoryCounts}
                            onExport={handleExportPriceHistory} 
                            onFetchPrices={handleManualPriceFetch} 
                        />
                        <BotStrategy />
                    </div>
                </div>
            </main>
            <Terminal logs={terminalLog} onExport={handleExportTerminalLog} />
            <ManualAnalysisModal 
                isOpen={isManualAnalysisModalOpen}
                onClose={() => setIsManualAnalysisModalOpen(false)}
                onSubmit={handleSubmitManualAnalysis}
                prompt={manualAnalysisPrompt}
            />
        </div>
    );
};

export default App;
