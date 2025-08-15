
import React, { useState, useEffect } from 'react';
import type { StrategyConfig } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Slider } from './ui/Slider';
import { AVAILABLE_TIMEFRAMES } from '../constants';

interface ControlPanelProps {
    initialConfig: StrategyConfig;
    onConfigChange: (config: StrategyConfig) => void;
    onAnalyze: (config: StrategyConfig) => void;
    isLoading: boolean;
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="text-lg font-semibold text-cyan-400 mb-4 border-b border-gray-700 pb-2">{children}</h3>
);

const Label: React.FC<{ htmlFor: string, children: React.ReactNode, tooltip?: string }> = ({ htmlFor, children, tooltip }) => (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-300 mb-1" title={tooltip}>
        {children}
    </label>
);


export const ControlPanel: React.FC<ControlPanelProps> = ({ initialConfig, onConfigChange, onAnalyze, isLoading }) => {
    const [localConfig, setLocalConfig] = useState(initialConfig);

    useEffect(() => {
        onConfigChange(localConfig);
    }, [localConfig, onConfigChange]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        setLocalConfig(prev => ({
            ...prev,
            [name]: type === 'number' ? parseFloat(value) : value,
        }));
    };
    
    const handleStringArrayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setLocalConfig(prev => ({ ...prev, [name]: value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) }));
    };

    const handleTimeframeChange = (timeframe: string) => {
        setLocalConfig(prev => {
            const newTimeframes = prev.timeframes.includes(timeframe)
                ? prev.timeframes.filter(tf => tf !== timeframe)
                : [...prev.timeframes, timeframe];
            return { ...prev, timeframes: newTimeframes };
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onAnalyze(localConfig);
    };

    return (
        <Card>
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Control Panel</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <SectionTitle>Market & Risk</SectionTitle>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="trading_pairs">Trading Pairs (comma-separated)</Label>
                            <Input
                                id="trading_pairs"
                                name="trading_pairs"
                                value={localConfig.trading_pairs.join(', ')}
                                onChange={handleStringArrayChange}
                                placeholder="ETH/USDT, BTC/USDT"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="trade_amount_usd">Trade Amount (USD)</Label>
                                <Input id="trade_amount_usd" name="trade_amount_usd" type="number" value={localConfig.trade_amount_usd} onChange={handleInputChange} />
                            </div>
                            <div>
                                <Label htmlFor="max_concurrent_trades">Max Open Trades</Label>
                                <Input id="max_concurrent_trades" name="max_concurrent_trades" type="number" step="1" value={localConfig.max_concurrent_trades} onChange={handleInputChange} />
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="take_profit_pct">Take Profit ({localConfig.take_profit_pct}%)</Label>
                            <Slider id="take_profit_pct" name="take_profit_pct" min="0.1" max="10" step="0.1" value={localConfig.take_profit_pct} onChange={handleInputChange} />
                        </div>
                        <div>
                            <Label htmlFor="stop_loss_pct">Stop Loss ({localConfig.stop_loss_pct}%)</Label>
                            <Slider id="stop_loss_pct" name="stop_loss_pct" min="0.1" max="10" step="0.1" value={localConfig.stop_loss_pct} onChange={handleInputChange} />
                        </div>
                    </div>
                </div>

                <div>
                    <SectionTitle>Technical Indicators</SectionTitle>
                     <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <Label htmlFor="short_ma">Short MA Period</Label>
                                <Input id="short_ma" name="short_ma" type="number" step="1" value={localConfig.short_ma} onChange={handleInputChange} />
                            </div>
                            <div>
                                <Label htmlFor="long_ma">Long MA Period</Label>
                                <Input id="long_ma" name="long_ma" type="number" step="1" value={localConfig.long_ma} onChange={handleInputChange} />
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="rsi_period">RSI Period</Label>
                            <Input id="rsi_period" name="rsi_period" type="number" step="1" value={localConfig.rsi_period} onChange={handleInputChange} />
                        </div>
                        <div>
                           <Label htmlFor="timeframes">Analysis Timeframes</Label>
                            <div className="grid grid-cols-4 gap-2 mt-2">
                                {AVAILABLE_TIMEFRAMES.map(tf => (
                                    <button
                                        type="button"
                                        key={tf}
                                        onClick={() => handleTimeframeChange(tf)}
                                        className={`px-2 py-1 text-xs rounded transition-colors ${
                                            localConfig.timeframes.includes(tf) 
                                            ? 'bg-cyan-500 text-white font-semibold' 
                                            : 'bg-gray-700 hover:bg-gray-600'
                                        }`}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Analyzing...' : 'Run Analysis'}
                </Button>
            </form>
        </Card>
    );
};
