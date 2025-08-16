import React from 'react';
import type { Signal, TimeframeAnalysis } from '../types';
import { Button } from './ui/Button';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ChevronUpIcon } from './icons/ChevronUpIcon';

interface SignalCardProps {
    signal: Signal;
    onOpenTimeframeTrade: (pair: string, direction: 'LONG' | 'SHORT') => void;
    isTradeOpen: boolean;
    isExpanded: boolean;
    onToggleDetails: () => void;
    tradeAmountUSD: number;
}

const getActionClasses = (action: 'buy' | 'sell' | 'hold') => {
    switch (action) {
        case 'buy': return 'bg-green-500/10 text-green-400 border-green-500/30';
        case 'sell': return 'bg-red-500/10 text-red-400 border-red-500/30';
        case 'hold': return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
};

const TimeframeRow: React.FC<{ tf: TimeframeAnalysis }> = ({ tf }) => {
    const signalClass = tf.signal === 'bull' ? 'text-green-400' : tf.signal === 'bear' ? 'text-red-400' : 'text-gray-400';
    const scoreDefined = typeof tf.score === 'number';
    const scoreClass = scoreDefined ? (tf.score! > 0 ? 'text-green-400' : tf.score! < 0 ? 'text-red-400' : 'text-gray-400') : 'text-gray-400';

    return (
        <tr className="border-b border-gray-700/50 last:border-b-0">
            <td className="p-1.5 font-semibold text-gray-200">{tf.timeframe}</td>
            <td className={`p-1.5 font-bold uppercase text-xs ${signalClass}`}>{tf.signal}</td>
            <td className={`p-1.5 font-mono text-xs ${scoreClass}`}>
                {scoreDefined ? tf.score!.toFixed(3) : 'N/A'}
            </td>
            <td className="p-1.5 font-mono text-xs">{`${(tf.confidence * 100).toFixed(1)}%`}</td>
            <td className="p-1.5 font-mono text-xs text-gray-400">{tf.samples ?? 'N/A'}</td>
        </tr>
    );
};


export const SignalCard: React.FC<SignalCardProps> = ({ signal, onOpenTimeframeTrade, isTradeOpen, isExpanded, onToggleDetails, tradeAmountUSD }) => {
    const actionClasses = getActionClasses(signal.action);

    return (
        <div className={`rounded-lg border p-5 flex flex-col justify-between transition-all duration-300 ${actionClasses} bg-opacity-10`}>
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
                        <span className="text-gray-400">Aggregate P(Win)</span>
                        <div className="w-1/2 bg-gray-700 rounded-full h-2.5">
                            <div className="bg-cyan-400 h-2.5 rounded-full" style={{ width: `${Math.round(signal.confidence * 100)}%` }}></div>
                        </div>
                        <span className="font-semibold text-gray-200">{Math.round(signal.confidence * 100)}%</span>
                    </div>
                     <div className="flex justify-between items-center">
                        <span className="text-gray-400">Bet Size (USD)</span>
                        <span className="font-semibold text-gray-200 font-mono">${signal.betSizeUSD?.toFixed(2) ?? '0.00'}</span>
                    </div>
                    {signal.note && <p className="text-xs text-yellow-500/80 pt-2 italic">Note: {signal.note}</p>}
                </div>
            </div>

            <div className="mt-5">
                {isExpanded && (
                    <div className="mb-5 border-t border-gray-700/50 pt-4 animate-fade-in space-y-4">
                         <div>
                            <h4 className="font-semibold mb-2 text-gray-300 text-sm">Confidence Map</h4>
                            <div className="max-h-48 overflow-y-auto bg-gray-900/40 rounded-md p-1">
                                <table className="w-full text-center">
                                    <thead className="text-xs text-gray-400 uppercase">
                                        <tr>
                                            <th className="p-1 font-medium">TF</th>
                                            <th className="p-1 font-medium">Signal</th>
                                            <th className="p-1 font-medium">Score</th>
                                            <th className="p-1 font-medium">P(Win)</th>
                                            <th className="p-1 font-medium">N</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {signal.meta.map(tf => <TimeframeRow key={tf.timeframe} tf={tf} />)}
                                    </tbody>
                                </table>
                            </div>
                         </div>
                        {(signal.action === 'buy' || signal.action === 'sell') && (
                             <div>
                                <h4 className="font-semibold mb-2 text-gray-300 text-sm">Manual Trade</h4>
                                 <Button
                                    onClick={() => onOpenTimeframeTrade(signal.pair, signal.action === 'buy' ? 'LONG' : 'SHORT')}
                                    disabled={isTradeOpen}
                                    variant={signal.action === 'buy' ? 'primary' : 'danger'}
                                    className="w-full"
                                >
                                    {isTradeOpen ? 'Position Open' : `Open ${signal.action === 'buy' ? 'LONG' : 'SHORT'} Trade`}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <button onClick={onToggleDetails} className="w-full text-gray-400 hover:text-white flex items-center justify-center gap-1 text-sm py-2 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors">
                       {isExpanded ? <><ChevronUpIcon/> Less</> : <><ChevronDownIcon/> Details</>}
                    </button>
                </div>
            </div>
        </div>
    );
};
