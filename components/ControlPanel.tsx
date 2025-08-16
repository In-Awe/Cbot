import React, { useState, useEffect } from 'react';
import type { StrategyConfig } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Slider } from './ui/Slider';
import { COMMON_TRADING_PAIRS } from '../constants';

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
    
    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setLocalConfig(prev => ({ ...prev, [name]: parseFloat(value) }));
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

    return (
        <Card>
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Strategy Configuration</h2>
            <form className="space-y-6">
                <div>
                    <SectionTitle>Market & Capital</SectionTitle>
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
                        <div>
                            <Label htmlFor="total_capital_usd">Total Capital (USD)</Label>
                            <Input id="total_capital_usd" name="total_capital_usd" type="number" value={localConfig.total_capital_usd} onChange={handleInputChange} disabled={isSimulating}/>
                        </div>
                    </div>
                </div>

                 <div>
                    <SectionTitle>Risk Management</SectionTitle>
                     <div className="space-y-4">
                        <div>
                            <Label htmlFor="base_kelly_fraction" tooltip="A safety multiplier applied to all Kelly bets. 0.5 is recommended.">Base Kelly Fraction ({localConfig.base_kelly_fraction})</Label>
                            <Slider id="base_kelly_fraction" name="base_kelly_fraction" min="0.1" max="1" step="0.05" value={localConfig.base_kelly_fraction} onChange={handleSliderChange} disabled={isSimulating}/>
                        </div>
                        <div>
                            <Label htmlFor="max_bet_pct" tooltip="The absolute maximum percentage of capital to risk on a single trade.">Max Bet % ({localConfig.max_bet_pct * 100}%)</Label>
                            <Slider id="max_bet_pct" name="max_bet_pct" min="0.005" max="0.1" step="0.005" value={localConfig.max_bet_pct} onChange={handleSliderChange} disabled={isSimulating}/>
                        </div>
                         <div>
                            <Label htmlFor="max_concurrent_trades">Max Open Trades</Label>
                             <Input id="max_concurrent_trades" name="max_concurrent_trades" type="number" step="1" min="1" value={localConfig.max_concurrent_trades} onChange={handleInputChange} disabled={isSimulating} />
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