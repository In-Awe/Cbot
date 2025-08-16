import React, { useState, useEffect } from 'react';
import type { StrategyConfig } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Slider } from './ui/Slider';
import { AVAILABLE_TIMEFRAMES, COMMON_TRADING_PAIRS } from '../constants';

interface ControlPanelProps {
    initialConfig: StrategyConfig;
    onConfigChange: (config: StrategyConfig) => void;
    onAnalyze: () => void;
    isLoading: boolean;
    isSimulating: boolean;
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="text-lg font-semibold text-cyan-400 mb-4 border-b border-gray-700 pb-2">{children}</h3>
);

const Label: React.FC<{ htmlFor: string, children: React.ReactNode, tooltip?: string }> = ({ htmlFor, children, tooltip }) => (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-300 mb-1" title={tooltip}>
        {children}
    </label>
);


export const ControlPanel: React.FC<ControlPanelProps> = ({ initialConfig, onConfigChange, onAnalyze, isLoading, isSimulating }) => {
    const [localConfig, setLocalConfig] = useState(initialConfig);
    const [pairInput, setPairInput] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    
    useEffect(() => {
        onConfigChange(localConfig);
    }, [localConfig, onConfigChange]);
    
    useEffect(() => {
        setLocalConfig(initialConfig);
    }, [initialConfig]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        setLocalConfig(prev => ({
            ...prev,
            [name]: type === 'number' ? parseFloat(value) : value,
        }));
    };

    const handlePairInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.toUpperCase();
        setPairInput(value);
        if (value) {
            const filtered = COMMON_TRADING_PAIRS.filter(p => p.startsWith(value) && !localConfig.trading_pairs.includes(p));
            setSuggestions(filtered.slice(0, 5));
        } else {
            setSuggestions([]);
        }
    };
    
    const addPair = (pair: string) => {
        if (pair && !localConfig.trading_pairs.includes(pair)) {
            setLocalConfig(prev => ({ ...prev, trading_pairs: [...prev.trading_pairs, pair] }));
        }
        setPairInput('');
        setSuggestions([]);
    };

    const removePair = (pairToRemove: string) => {
        setLocalConfig(prev => ({...prev, trading_pairs: prev.trading_pairs.filter(p => p !== pairToRemove)}));
    };

    const handleTimeframeChange = (timeframe: string) => {
        setLocalConfig(prev => {
            const newTimeframes = prev.timeframes.includes(timeframe)
                ? prev.timeframes.filter(tf => tf !== timeframe)
                : [...prev.timeframes, timeframe];
            return { ...prev, timeframes: newTimeframes };
        });
    };

    return (
        <Card>
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Strategy Configuration</h2>
            <form className="space-y-6">
                <div>
                    <SectionTitle>Market & Risk</SectionTitle>
                    <div className="space-y-4">
                        <div className="relative">
                            <Label htmlFor="trading_pairs">Trading Pairs</Label>
                             <div className="flex flex-wrap gap-2 p-2 bg-gray-700/50 border border-gray-600 rounded-md mb-2 min-h-[42px]">
                                {localConfig.trading_pairs.map(pair => (
                                    <span key={pair} className="flex items-center gap-2 bg-cyan-600/50 text-cyan-100 text-xs font-semibold px-2 py-1 rounded">
                                        {pair}
                                        {!isSimulating && (
                                            <button type="button" onClick={() => removePair(pair)} className="text-cyan-200 hover:text-white">&times;</button>
                                        )}
                                    </span>
                                ))}
                            </div>
                            <Input
                                id="trading_pairs_input"
                                name="trading_pairs_input"
                                value={pairInput}
                                onChange={handlePairInputChange}
                                onKeyDown={(e) => { if (e.key === 'Enter' && pairInput) { e.preventDefault(); addPair(pairInput); } }}
                                placeholder="Type to add a pair..."
                                disabled={isSimulating}
                            />
                            {suggestions.length > 0 && (
                                <ul className="absolute z-10 w-full bg-gray-800 border border-gray-600 rounded-md mt-1 max-h-40 overflow-y-auto">
                                    {suggestions.map(s => (
                                        <li key={s} onClick={() => addPair(s)} className="px-3 py-2 text-sm text-gray-200 cursor-pointer hover:bg-gray-700">
                                            {s}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="total_capital_usd">Total Capital (USD)</Label>
                                <Input id="total_capital_usd" name="total_capital_usd" type="number" value={localConfig.total_capital_usd} onChange={handleInputChange} disabled={isSimulating}/>
                            </div>
                            <div>
                                <Label htmlFor="max_concurrent_trades">Max Open Trades</Label>
                                <Input id="max_concurrent_trades" name="max_concurrent_trades" type="number" step="1" value={localConfig.max_concurrent_trades} onChange={handleInputChange} disabled={isSimulating}/>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="kelly_fraction">Base Kelly Fraction ({localConfig.kelly_fraction})</Label>
                            <Slider id="kelly_fraction" name="kelly_fraction" min="0.1" max="1" step="0.05" value={localConfig.kelly_fraction} onChange={handleInputChange} disabled={isSimulating}/>
                        </div>
                    </div>
                </div>

                 <div>
                    <SectionTitle>Regime Analysis</SectionTitle>
                     <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                         <div><Label htmlFor="regime_trend_timeframe_h">Trend TF (Hours)</Label><Input id="regime_trend_timeframe_h" name="regime_trend_timeframe_h" type="number" value={localConfig.regime_trend_timeframe_h} onChange={handleInputChange} disabled={isSimulating}/></div>
                         <div><Label htmlFor="regime_volatility_atr_period">ATR Period</Label><Input id="regime_volatility_atr_period" name="regime_volatility_atr_period" type="number" value={localConfig.regime_volatility_atr_period} onChange={handleInputChange} disabled={isSimulating}/></div>
                         <div><Label htmlFor="regime_trend_fast_ema">Fast EMA</Label><Input id="regime_trend_fast_ema" name="regime_trend_fast_ema" type="number" value={localConfig.regime_trend_fast_ema} onChange={handleInputChange} disabled={isSimulating}/></div>
                         <div><Label htmlFor="regime_trend_slow_ema">Slow EMA</Label><Input id="regime_trend_slow_ema" name="regime_trend_slow_ema" type="number" value={localConfig.regime_trend_slow_ema} onChange={handleInputChange} disabled={isSimulating}/></div>
                         <div><Label htmlFor="regime_volatility_high_threshold_pct">High Vol %</Label><Input id="regime_volatility_high_threshold_pct" name="regime_volatility_high_threshold_pct" type="number" step="0.1" value={localConfig.regime_volatility_high_threshold_pct} onChange={handleInputChange} disabled={isSimulating}/></div>
                         <div><Label htmlFor="regime_volatility_low_threshold_pct">Low Vol %</Label><Input id="regime_volatility_low_threshold_pct" name="regime_volatility_low_threshold_pct" type="number" step="0.1" value={localConfig.regime_volatility_low_threshold_pct} onChange={handleInputChange} disabled={isSimulating}/></div>
                     </div>
                </div>

                <div>
                    <SectionTitle>Bot Settings</SectionTitle>
                     <div className="space-y-4">
                        <div>
                           <Label htmlFor="timeframes">Signal Timeframe (Primary)</Label>
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
                                        } ${isSimulating ? 'cursor-not-allowed opacity-70' : ''}`}
                                        disabled={isSimulating}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                
                <Button type="button" onClick={onAnalyze} className="w-full" variant="secondary">
                    Generate Performance Report
                </Button>
            </form>
        </Card>
    );
};