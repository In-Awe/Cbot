
import React, { useState, useEffect, useCallback } from 'react';
import type { StrategyConfig } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Slider } from './ui/Slider';

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

const AssetToggle: React.FC<{label: string, isEnabled: boolean, onToggle: (pair: string) => void, disabled: boolean}> = ({label, isEnabled, onToggle, disabled}) => (
    <div className="flex items-center justify-between p-2 bg-gray-900/40 rounded-md">
        <span className="text-sm font-medium text-gray-200">{label}</span>
        <button
            type="button"
            onClick={() => onToggle(label)}
            disabled={disabled}
            className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors disabled:opacity-50 ${
                isEnabled ? 'bg-cyan-600' : 'bg-gray-600'
            }`}
        >
            <span
                className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                    isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
        </button>
    </div>
);


export const ControlPanel: React.FC<ControlPanelProps> = ({ initialConfig, onConfigChange, onAnalyze, isLoading, isSimulating }) => {
    const [localConfig, setLocalConfig] = useState(initialConfig);
    const availablePairs = ["XRP/USDT", "SOL/USDT", "BNB/USDT"];
    
    useEffect(() => {
        onConfigChange(localConfig);
    }, [localConfig, onConfigChange]);
    
    useEffect(() => {
        setLocalConfig(initialConfig);
    }, [initialConfig]);

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setLocalConfig(prev => ({ ...prev, [name]: parseFloat(value) }));
    };
    
    const handlePairToggle = (pair: string) => {
        setLocalConfig(prev => {
            const isEnabled = prev.trading_pairs.includes(pair);
            if (isEnabled) {
                return {...prev, trading_pairs: prev.trading_pairs.filter(p => p !== pair)};
            } else {
                return {...prev, trading_pairs: [...prev.trading_pairs, pair]};
            }
        });
    };

    return (
        <Card>
            <h2 className="text-2xl font-bold text-gray-100 mb-6">"Leviathan" Strategy Config</h2>
            <form className="space-y-6">
                 <div>
                    <SectionTitle>Asset Profiles</SectionTitle>
                    <div className="space-y-2">
                        <p className="text-xs text-gray-400 mb-2">Enable or disable the pre-calibrated trading profiles for each asset.</p>
                        {availablePairs.map(pair => (
                            <AssetToggle 
                                key={pair}
                                label={pair}
                                isEnabled={localConfig.trading_pairs.includes(pair)}
                                onToggle={handlePairToggle}
                                disabled={isSimulating}
                            />
                        ))}
                    </div>
                </div>

                <div>
                    <SectionTitle>Global Strategy Settings</SectionTitle>
                     <div className="space-y-4">
                        <div>
                            <Label htmlFor="bband_period">Bollinger Bands Period ({localConfig.bband_period})</Label>
                            <Slider id="bband_period" name="bband_period" min="10" max="30" step="1" value={localConfig.bband_period} onChange={handleSliderChange} disabled={isSimulating}/>
                        </div>
                        <div>
                            <Label htmlFor="bband_std_dev">Bollinger Bands StdDev ({localConfig.bband_std_dev.toFixed(1)})</Label>
                            <Slider id="bband_std_dev" name="bband_std_dev" min="1.5" max="3.0" step="0.1" value={localConfig.bband_std_dev} onChange={handleSliderChange} disabled={isSimulating}/>
                        </div>
                         <div>
                            <Label htmlFor="trailing_stop_percent">Final Trailing Stop ({(localConfig.trailing_stop_percent * 100).toFixed(1)}%)</Label>
                            <Slider id="trailing_stop_percent" name="trailing_stop_percent" min="0.01" max="0.05" step="0.005" value={localConfig.trailing_stop_percent} onChange={handleSliderChange} disabled={isSimulating}/>
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
