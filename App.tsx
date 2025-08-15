
import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { SignalDashboard } from './components/SignalDashboard';
import { OpenPositions } from './components/OpenPositions';
import type { StrategyConfig, Signal, Trade } from './types';
import { generateTradingSignals } from './services/geminiService';
import { DEFAULT_STRATEGY_CONFIG } from './constants';

const App: React.FC = () => {
    const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
    const [signals, setSignals] = useState<Signal[]>([]);
    const [openTrades, setOpenTrades] = useState<Trade[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = useCallback(async (newConfig: StrategyConfig) => {
        setIsLoading(true);
        setError(null);
        setSignals([]);
        try {
            const generatedSignals = await generateTradingSignals(newConfig);
            setSignals(generatedSignals);
        } catch (e) {
            console.error(e);
            setError('Failed to generate trading signals. Please check your API key and try again.');
        } finally {
            setIsLoading(false);
        }
    }, []);

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
        };
        setOpenTrades(prev => [...prev, newTrade]);
    }, [openTrades, config.max_concurrent_trades]);

    const handleCloseTrade = useCallback((tradeId: string) => {
        setOpenTrades(prev => prev.filter(trade => trade.id !== tradeId));
    }, []);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200">
            <Header />
            <main className="p-4 sm:p-6 lg:p-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-3">
                        <ControlPanel
                            initialConfig={config}
                            onConfigChange={setConfig}
                            onAnalyze={handleAnalyze}
                            isLoading={isLoading}
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
                            isLoading={isLoading}
                            onOpenTrade={handleOpenTrade}
                            openTradePairs={openTrades.map(t => t.pair)}
                        />
                        <OpenPositions trades={openTrades} onCloseTrade={handleCloseTrade} />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;
