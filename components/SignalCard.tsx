
import React, { useState } from 'react';
import type { Signal, TimeframeAnalysis } from '../types';
import { Button } from './ui/Button';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ChevronUpIcon } from './icons/ChevronUpIcon';

interface SignalCardProps {
    signal: Signal;
    onOpenTrade: (signal: Signal) => void;
    isTradeOpen: boolean;
}

const getActionClasses = (action: 'buy' | 'sell' | 'hold') => {
    switch (action) {
        case 'buy': return 'bg-green-500/10 text-green-400 border-green-500/30';
        case 'sell': return 'bg-red-500/10 text-red-400 border-red-500/30';
        case 'hold': return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
};

const getSignalChipClasses = (signal: TimeframeAnalysis['signal']) => {
    switch (signal) {
        case 'bull': return 'bg-green-500/20 text-green-300';
        case 'bear': return 'bg-red-500/20 text-red-300';
        default: return 'bg-gray-500/20 text-gray-300';
    }
}

export const SignalCard: React.FC<SignalCardProps> = ({ signal, onOpenTrade, isTradeOpen }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const actionClasses = getActionClasses(signal.action);

    return (
        <div className={`rounded-lg border p-5 flex flex-col justify-between transition-all duration-300 ${actionClasses} ${isExpanded ? 'bg-opacity-20' : ''}`}>
            <div>
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-2xl font-bold text-gray-100">{signal.pair}</h3>
                        <p className="text-sm text-gray-400">Last Price: ${signal.last_price?.toFixed(4)}</p>
                    </div>
                    <span className={`px-4 py-1.5 rounded-full text-lg font-bold uppercase tracking-wider ${actionClasses.replace('border-green-500/30', '').replace('border-red-500/30','').replace('border-gray-500/30', '')}`}>
                        {signal.action}
                    </span>
                </div>

                <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">Confidence</span>
                        <div className="w-1/2 bg-gray-700 rounded-full h-2.5">
                            <div className="bg-cyan-400 h-2.5 rounded-full" style={{ width: `${Math.round(signal.confidence * 100)}%` }}></div>
                        </div>
                        <span className="font-semibold text-gray-200">{Math.round(signal.confidence * 100)}%</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Take Profit</span>
                        <span className="font-mono text-green-400">${signal.take_profit?.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Stop Loss</span>
                        <span className="font-mono text-red-400">${signal.stop_loss?.toFixed(4)}</span>
                    </div>
                    {signal.note && <p className="text-xs text-yellow-500/80 pt-2 italic">Note: {signal.note}</p>}
                </div>
            </div>

            <div className="mt-5">
                {isExpanded && (
                    <div className="mb-5 border-t border-gray-700 pt-4">
                        <h4 className="font-semibold mb-2 text-gray-300">Timeframe Analysis</h4>
                        <div className="space-y-1 text-xs">
                            {Object.entries(signal.meta).map(([tf, analysis]) => (
                                <div key={tf} className="flex justify-between items-center bg-gray-800/50 p-1.5 rounded">
                                    <span className="font-medium text-gray-400 w-10">{tf}</span>
                                    <span className={`px-2 py-0.5 rounded text-center capitalize ${getSignalChipClasses(analysis.signal)}`}>{analysis.signal}</span>
                                    <span className="text-gray-300 w-20 text-right">Conf: {(analysis.confidence * 100).toFixed(0)}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsExpanded(!isExpanded)} className="flex-1 text-gray-400 hover:text-white flex items-center justify-center gap-1 text-sm py-2 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors">
                       {isExpanded ? <><ChevronUpIcon/> Less</> : <><ChevronDownIcon/> Details</>}
                    </button>
                    {signal.action !== 'hold' && (
                        <Button 
                            onClick={() => onOpenTrade(signal)} 
                            className="flex-grow-[2]"
                            variant={signal.action === 'buy' ? 'primary' : 'danger'}
                            disabled={isTradeOpen}
                        >
                            {isTradeOpen ? 'Position Open' : `Open ${signal.action === 'buy' ? 'Long' : 'Short'}`}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
