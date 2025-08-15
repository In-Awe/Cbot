
import React from 'react';
import type { AnalysisLogEntry, TimeframeAnalysis } from '../types';
import { Card } from './ui/Card';
import { DownloadIcon } from './icons/DownloadIcon';

interface AnalysisLogProps {
    logEntries: AnalysisLogEntry[];
    onExport: () => void;
}

const getActionColor = (action: string) => {
    if (action === 'buy') return 'text-green-400';
    if (action === 'sell') return 'text-red-400';
    return 'text-gray-400';
}

const getSignalChipClasses = (signal: TimeframeAnalysis['signal']) => {
    switch (signal) {
        case 'bull': return 'bg-green-500/20 text-green-300';
        case 'bear': return 'bg-red-500/20 text-red-300';
        default: return 'bg-gray-500/20 text-gray-300';
    }
}

export const AnalysisLog: React.FC<AnalysisLogProps> = ({ logEntries, onExport }) => {
    return (
        <Card>
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-100">Live Analysis Log</h2>
                <button 
                    onClick={onExport}
                    disabled={logEntries.length === 0}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-300 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <DownloadIcon />
                    <span>Download CSV</span>
                </button>
            </div>
            
            {logEntries.length === 0 ? (
                <div className="text-center py-10">
                    <p className="text-gray-400">Run a simulation or manual analysis to see the log here.</p>
                </div>
            ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th scope="col" className="px-4 py-3">Time</th>
                                <th scope="col" className="px-4 py-3">Pair</th>
                                <th scope="col" className="px-4 py-3">Price</th>
                                <th scope="col" className="px-4 py-3">Action</th>
                                <th scope="col" className="px-4 py-3">Confidence</th>
                                <th scope="col" className="px-4 py-3 min-w-[200px]">Timeframe Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logEntries.map(entry => (
                                <tr key={entry.id} className="border-b border-gray-700 hover:bg-gray-800/40">
                                    <td className="px-4 py-3 whitespace-nowrap">{entry.timestamp.toLocaleTimeString()}</td>
                                    <td className="px-4 py-3 font-medium text-white">{entry.pair}</td>
                                    <td className="px-4 py-3 font-mono">${entry.price.toFixed(4)}</td>
                                    <td className={`px-4 py-3 font-semibold uppercase ${getActionColor(entry.action)}`}>
                                        {entry.action}
                                    </td>
                                    <td className="px-4 py-3">{(entry.confidence * 100).toFixed(0)}%</td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1">
                                            {entry.meta?.map(m => (
                                                <span key={m.timeframe} className={`px-1.5 py-0.5 text-[10px] rounded ${getSignalChipClasses(m.signal)}`}>
                                                    {m.timeframe}: {(m.confidence * 100).toFixed(0)}%
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};
