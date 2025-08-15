import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { SignalDashboard } from './components/SignalDashboard';
import { OpenPositions } from './components/OpenPositions';
import { ConnectionPanel } from './components/ConnectionPanel';
import { AnalysisLog } from './components/AnalysisLog';
import { Terminal } from './components/Terminal';
import { SimulationControl } from './components/SimulationControl';
import type { StrategyConfig, Signal, Trade, AnalysisLogEntry, TerminalLogEntry, SimulationStatus } from './types';
import { generateTradingSignals } from './services/geminiService';
import { DEFAULT_STRATEGY_CONFIG } from './constants';

const SIMULATION_INTERVAL = 30000; // 30 seconds for a new "tick"
const MAX_LOG_ENTRIES = 8;

const App: React.FC = () => {
    const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
    const [signals, setSignals] = useState<Signal[]>([]);
    const [openTrades, setOpenTrades] = useState<Trade[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [simulationStatus, setSimulationStatus] = useState<SimulationStatus>('stopped');
    const [analysisLog, setAnalysisLog] = useState<AnalysisLogEntry[]>([]);
    const [terminalLog, setTerminalLog] = useState<TerminalLogEntry[]>([]);
    const [apiKey, setApiKey] = useState<string>('');

    const intervalRef = useRef<number | null>(null);

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
    
    const showNotification = useCallback((title: string, options: NotificationOptions & { pair?: string }) => {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }

        const notification = new Notification(title, options);
        if (options.pair) {
            notification.onclick = () => {
                const pairUrl = `https://www.binance.com/en/trade/${options.pair?.replace('/', '_')}`;
                window.open(pairUrl, '_blank');
            };
        }
    }, []);
    
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    const runAnalysis = useCallback(async (currentConfig: StrategyConfig, currentApiKey: string) => {
        if (!currentApiKey) {
            setError('API Key is not set. Please connect first.');
            setSimulationStatus('stopped');
            addLog('Simulation stopped: API Key missing.', 'error');
            return;
        }
        setIsLoading(true);
        setError(null);
        addLog('Requesting new signals from Gemini API...', 'request', { pairs: currentConfig.trading_pairs, timeframes: currentConfig.timeframes });

        try {
            const generatedSignals = await generateTradingSignals(currentConfig, currentApiKey);
            addLog('Received response from Gemini API.', 'response', generatedSignals);
            setSignals(generatedSignals);
            
            const updatedSignalsMap = new Map(generatedSignals.map(s => [s.pair, s]));

            if(simulationStatus === 'running'){
                 generatedSignals.forEach(signal => {
                    if (signal.action === 'buy' || signal.action === 'sell') {
                         showNotification(`${signal.action.toUpperCase()} Signal: ${signal.pair}`, {
                            body: `Price: $${signal.last_price?.toFixed(4)} | Confidence: ${Math.round(signal.confidence * 100)}% \nTP: ${signal.take_profit?.toFixed(4)}, SL: ${signal.stop_loss?.toFixed(4)}`,
                            icon: '/vite.svg',
                            pair: signal.pair,
                        });
                    }
                });
            }

            setOpenTrades(prevTrades => {
                const tradesAfterCheck = prevTrades.filter(trade => {
                    if (trade.status !== 'active') return true; 
                    const currentSignal = updatedSignalsMap.get(trade.pair);
                    if (!currentSignal?.last_price) return true; 

                    const currentPrice = currentSignal.last_price;
                    let isClosed = false;
                    
                    addLog(`Checking active trade ${trade.pair}: Current Price: $${currentPrice.toFixed(4)}, TP: $${trade.takeProfit.toFixed(4)}, SL: $${trade.stopLoss.toFixed(4)}`, 'info');

                    if (trade.direction === 'LONG') {
                        if (currentPrice >= trade.takeProfit) {
                            showNotification('Take Profit Hit!', { body: `${trade.pair} reached its TP of $${trade.takeProfit.toFixed(4)}.`, pair: trade.pair, icon: '/vite.svg' });
                            isClosed = true;
                        } else if (currentPrice <= trade.stopLoss) {
                            showNotification('Stop Loss Hit!', { body: `${trade.pair} reached its SL of $${trade.stopLoss.toFixed(4)}.`, pair: trade.pair, icon: '/vite.svg' });
                            isClosed = true;
                        }
                    } else { // SHORT
                        if (currentPrice <= trade.takeProfit) {
                            showNotification('Take Profit Hit!', { body: `${trade.pair} reached its TP of $${trade.takeProfit.toFixed(4)}.`, pair: trade.pair, icon: '/vite.svg' });
                            isClosed = true;
                        } else if (currentPrice >= trade.stopLoss) {
                            showNotification('Stop Loss Hit!', { body: `${trade.pair} reached its SL of $${trade.stopLoss.toFixed(4)}.`, pair: trade.pair, icon: '/vite.svg' });
                            isClosed = true;
                        }
                    }
                    if (isClosed) {
                        addLog(`Trade ${trade.pair} closed due to TP/SL hit.`, 'info');
                    }
                    return !isClosed;
                });
                return tradesAfterCheck;
            });

            const newLogEntries: AnalysisLogEntry[] = generatedSignals.map(signal => ({
                id: `${signal.pair}-${Date.now()}`,
                timestamp: new Date(),
                pair: signal.pair,
                price: signal.last_price || 0,
                action: signal.action,
                confidence: signal.confidence,
                analysisSummary: signal.meta.filter(analysis => ['bull', 'bear'].includes(analysis.signal)).slice(0, 3).map(an => `${an.timeframe}: ${an.signal}`).join(', ') || 'Neutral',
            }));
            setAnalysisLog(prev => [...newLogEntries, ...prev].slice(0, MAX_LOG_ENTRIES));

        } catch (e) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            const fullError = `Error generating signals: ${errorMessage}`;
            setError(fullError);
            addLog(fullError, 'error');
            if (simulationStatus === 'running') {
                setSimulationStatus('stopped');
                setError('Simulation failed and has been stopped. Please check terminal and API key.');
            }
        } finally {
            setIsLoading(false);
        }
    }, [simulationStatus, showNotification, addLog]);
    
    const handleManualAnalysis = () => {
        if(!apiKey) {
            alert("Please connect with a Gemini API key first.");
            return;
        }
        setSignals([]);
        runAnalysis(config, apiKey);
    }

    const handleConnect = useCallback((key: string) => {
        setApiKey(key);
        addLog('Gemini API Key set. Simulation ready.', 'info');
    }, [addLog]);

    const handleDisconnect = useCallback(() => {
        setSimulationStatus('stopped');
        setApiKey('');
        setSignals([]);
        setAnalysisLog([]);
        setTerminalLog([]);
        addLog('Disconnected from AI Engine.', 'info');
    }, [addLog]);
    
    const handlePlay = () => {
        addLog('Simulation starting...', 'info');
        setSimulationStatus('running');
        runAnalysis(config, apiKey); 
    };
    
    const handlePause = () => {
        addLog('Simulation paused.', 'info');
        setSimulationStatus('paused');
    };
    
    const handleStop = () => {
        addLog('Simulation stopped by user.', 'info');
        setSimulationStatus('stopped');
        setSignals([]);
        setAnalysisLog([]);
    }

    useEffect(() => {
        if (simulationStatus === 'running' && apiKey) {
            intervalRef.current = window.setInterval(() => runAnalysis(config, apiKey), SIMULATION_INTERVAL);
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [simulationStatus, config, runAnalysis, apiKey]);

    const handleOpenTrade = useCallback((signal: Signal) => {
        if (openTrades.length >= config.max_concurrent_trades) {
            alert("Max concurrent trades reached.");
            return;
        }
        if (openTrades.some(trade => trade.pair === signal.pair)) {
            alert("A trade for this pair is already open.");
            return;
        }
        const newTrade: Trade = {
            id: `${signal.pair}-${Date.now()}`,
            pair: signal.pair,
            direction: signal.action === 'buy' ? 'LONG' : 'SHORT',
            entryPrice: signal.last_price || 0,
            openedAt: new Date(),
            takeProfit: signal.take_profit || 0,
            stopLoss: signal.stop_loss || 0,
            status: 'pending',
        };
        setOpenTrades(prev => [newTrade, ...prev]);
        addLog(`Position for ${signal.pair} opened with status 'pending'.`, 'info');
    }, [openTrades, config.max_concurrent_trades, addLog]);
    
    const handleConfirmTrade = useCallback((tradeId: string) => {
        setOpenTrades(prev => prev.map(t => {
            if (t.id === tradeId) {
                addLog(`Confirmed trade for ${t.pair}. Position is now active.`, 'info');
                return { ...t, status: 'active' };
            }
            return t;
        }));
    }, [addLog]);

    const handleUpdateTrade = useCallback((tradeId: string, updates: Partial<Pick<Trade, 'entryPrice' | 'takeProfit' | 'stopLoss'>>) => {
        setOpenTrades(prev => prev.map(t => {
             if (t.id === tradeId) {
                addLog(`Updated trade parameters for ${t.pair}.`, 'info', updates);
                return { ...t, ...updates };
             }
             return t;
        }));
    }, [addLog]);

    const handleCloseTrade = useCallback((tradeId: string) => {
        const tradeToClose = openTrades.find(t => t.id === tradeId);
        if(tradeToClose){
            addLog(`Manually closed position for ${tradeToClose.pair}.`, 'info');
        }
        setOpenTrades(prev => prev.filter(trade => trade.id !== tradeId));
    }, [openTrades, addLog]);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col">
            <Header />
            <main className="p-4 sm:p-6 lg:p-8 flex-grow">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-3 space-y-8">
                         <ConnectionPanel
                            isConnected={!!apiKey}
                            simulationStatus={simulationStatus}
                            onConnect={handleConnect}
                            onDisconnect={handleDisconnect}
                        />
                        <SimulationControl
                            status={simulationStatus}
                            onPlay={handlePlay}
                            onPause={handlePause}
                            onStop={handleStop}
                            onAdvance={() => runAnalysis(config, apiKey)}
                            isDisabled={!apiKey || isLoading}
                        />
                        <ControlPanel
                            initialConfig={config}
                            onConfigChange={setConfig}
                            onAnalyze={handleManualAnalysis}
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
                            onOpenTrade={handleOpenTrade}
                            openTradePairs={openTrades.map(t => t.pair)}
                        />
                        <OpenPositions 
                            trades={openTrades} 
                            onCloseTrade={handleCloseTrade}
                            onConfirmTrade={handleConfirmTrade}
                            onUpdateTrade={handleUpdateTrade}
                        />
                        <AnalysisLog logEntries={analysisLog} />
                    </div>
                </div>
            </main>
            <Terminal logs={terminalLog} />
        </div>
    );
};

export default App;