
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { SignalDashboard } from './components/SignalDashboard';
import { OpenPositions } from './components/OpenPositions';
import { ConnectionPanel } from './components/ConnectionPanel';
import { AnalysisLog } from './components/AnalysisLog';
import { Terminal } from './components/Terminal';
import { SimulationControl } from './components/SimulationControl';
import { Scoreboard } from './components/Scoreboard';
import type { StrategyConfig, Signal, Trade, AnalysisLogEntry, TerminalLogEntry, SimulationStatus } from './types';
import { generateTradingSignals } from './services/geminiService';
import { DEFAULT_STRATEGY_CONFIG } from './constants';

const SIMULATION_INTERVAL = 30000; // 30 seconds for a new "tick"

// Custom hook to get the previous value of a prop or state
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

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [simulationStatus, setSimulationStatus] = useState<SimulationStatus>('stopped');
    const [analysisLog, setAnalysisLog] = useState<AnalysisLogEntry[]>([]);
    const [terminalLog, setTerminalLog] = useState<TerminalLogEntry[]>([]);
    const [apiKey, setApiKey] = useState<string>('');

    const intervalRef = useRef<number | null>(null);
    const configRef = useRef(config);
    const apiKeyRef = useRef(apiKey);

    useEffect(() => { configRef.current = config; }, [config]);
    useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);

    useEffect(() => {
        localStorage.setItem('openTrades', JSON.stringify(openTrades));
    }, [openTrades]);

    useEffect(() => {
        localStorage.setItem('closedTrades', JSON.stringify(closedTrades));
    }, [closedTrades]);


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
    
    // Log configuration changes to the terminal
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
    }, [config, prevConfig, addLog]);

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

    const closeTrade = useCallback((trade: Trade, exitPrice: number, reason: string) => {
        let pnl = 0;
        if (trade.direction === 'LONG') {
            pnl = (exitPrice - trade.entryPrice) * (config.trade_amount_usd / trade.entryPrice);
        } else { // SHORT
            pnl = (trade.entryPrice - exitPrice) * (config.trade_amount_usd / trade.entryPrice);
        }

        const closedTrade: Trade = {
            ...trade,
            status: 'closed',
            exitPrice,
            closedAt: new Date(),
            pnl
        };

        setClosedTrades(prev => [closedTrade, ...prev]);
        setOpenTrades(prev => prev.filter(t => t.id !== trade.id));
        
        const pnlString = pnl >= 0 ? `profit of $${pnl.toFixed(2)}` : `loss of $${Math.abs(pnl).toFixed(2)}`;
        showNotification(`Position Closed: ${trade.pair}`, { body: `${reason} for a ${pnlString}.`, pair: trade.pair, icon: '/vite.svg' });
        addLog(`Position for ${trade.pair} closed. Reason: ${reason}. PNL: $${pnl.toFixed(2)}`, 'info');

    }, [config.trade_amount_usd, showNotification, addLog]);


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
            
            const signalsMap = new Map(generatedSignals.map(s => [s.pair, s]));

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

            // Check open trades against new prices for TP/SL. This logic has been stabilized.
            const activeTrades = openTrades.filter(trade => trade.status === 'active');
            for (const trade of activeTrades) {
                const currentSignal = signalsMap.get(trade.pair);
                if (!currentSignal?.last_price) continue;
                
                const currentPrice = currentSignal.last_price;
                addLog(`Checking active trade ${trade.pair}: Current Price: $${currentPrice.toFixed(4)}, TP: $${trade.takeProfit.toFixed(4)}, SL: $${trade.stopLoss.toFixed(4)}`, 'info');

                if (trade.direction === 'LONG') {
                    if (currentPrice >= trade.takeProfit) {
                        closeTrade(trade, trade.takeProfit, 'Take Profit hit');
                    } else if (currentPrice <= trade.stopLoss) {
                        closeTrade(trade, trade.stopLoss, 'Stop Loss hit');
                    }
                } else { // SHORT
                    if (currentPrice <= trade.takeProfit) {
                        closeTrade(trade, trade.takeProfit, 'Take Profit hit');
                    } else if (currentPrice >= trade.stopLoss) {
                        closeTrade(trade, trade.stopLoss, 'Stop Loss hit');
                    }
                }
            }

            const newLogEntries: AnalysisLogEntry[] = generatedSignals.map(signal => ({
                id: `${signal.pair}-${Date.now()}`,
                timestamp: new Date(),
                pair: signal.pair,
                price: signal.last_price || 0,
                action: signal.action,
                confidence: signal.confidence,
                meta: signal.meta, // Capture full timeframe analysis
            }));
            setAnalysisLog(prev => [...newLogEntries, ...prev]);

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
    }, [simulationStatus, showNotification, addLog, closeTrade, openTrades]);
    
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
        runAnalysis(configRef.current, apiKeyRef.current); 
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
        if (simulationStatus === 'running' && apiKeyRef.current) {
            intervalRef.current = window.setInterval(() => runAnalysis(configRef.current, apiKeyRef.current), SIMULATION_INTERVAL);
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [simulationStatus, runAnalysis]);

    const handleOpenTimeframeTrade = useCallback((pair: string, direction: 'LONG' | 'SHORT') => {
        const signal = signals.find(s => s.pair === pair);
        if (!signal || !signal.last_price || !signal.take_profit || !signal.stop_loss) {
            alert("Cannot open trade: signal data is incomplete.");
            return;
        }

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
            direction: direction,
            entryPrice: signal.last_price,
            openedAt: new Date(),
            takeProfit: signal.take_profit,
            stopLoss: signal.stop_loss,
            status: 'pending',
        };
        setOpenTrades(prev => [newTrade, ...prev]);
        addLog(`Position for ${signal.pair} (${direction}) opened with status 'pending'.`, 'info');
    }, [signals, openTrades, config.max_concurrent_trades, addLog]);
    
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
            const signal = signals.find(s => s.pair === tradeToClose.pair);
            const exitPrice = signal?.last_price || tradeToClose.entryPrice;
            closeTrade(tradeToClose, exitPrice, 'Manual close');
        }
    }, [openTrades, signals, closeTrade]);
    
    const arrayToCsv = (data: any[], columns: {key: string, label: string}[]) => {
        if (data.length === 0) return '';
        const header = columns.map(c => c.label).join(',');
        const rows = data.map(row => 
            columns.map(col => {
                let cell = row[col.key];
                 if (typeof cell === 'object' && cell !== null && !(cell instanceof Date)) {
                    cell = JSON.stringify(cell);
                }
                if (cell === null || cell === undefined) {
                    return '';
                }
                if (cell instanceof Date) {
                    return cell.toISOString();
                }
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
        const columns = [
            { key: 'timestamp', label: 'Timestamp' },
            { key: 'pair', label: 'Pair' },
            { key: 'price', label: 'Price' },
            { key: 'action', label: 'Action' },
            { key: 'confidence', label: 'Confidence' },
            { key: 'meta', label: 'Timeframe Analysis (JSON)' },
        ];
        const csvString = arrayToCsv(analysisLog, columns);
        downloadCsv(csvString, `analysis-log-${new Date().toISOString().slice(0,10)}.csv`);
    }, [analysisLog]);

    const handleExportTerminalLog = useCallback(() => {
        const columns = [
            { key: 'timestamp', label: 'Timestamp' },
            { key: 'type', label: 'Type' },
            { key: 'message', label: 'Message' },
            { key: 'data', label: 'Data (JSON)' },
        ];
        const logsToExport = [...terminalLog].reverse(); // Export in chronological order
        const csvString = arrayToCsv(logsToExport.map(({ id, ...rest }) => rest), columns);
        downloadCsv(csvString, `terminal-log-${new Date().toISOString().slice(0,10)}.csv`);
    }, [terminalLog]);


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
                        <Scoreboard openTrades={openTrades} closedTrades={closedTrades} signals={signals} />
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
                        <OpenPositions 
                            openTrades={openTrades} 
                            closedTrades={closedTrades}
                            onCloseTrade={handleCloseTrade}
                            onConfirmTrade={handleConfirmTrade}
                            onUpdateTrade={handleUpdateTrade}
                        />
                        <AnalysisLog logEntries={analysisLog} onExport={handleExportAnalysisLog} />
                    </div>
                </div>
            </main>
            <Terminal logs={terminalLog} onExport={handleExportTerminalLog} />
        </div>
    );
};

export default App;
