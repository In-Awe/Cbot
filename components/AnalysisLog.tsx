import React from 'react';
import type { AnalysisLogEntry } from '../types';
import { Card } from './ui/Card';

interface AnalysisLogProps {
    logEntries: AnalysisLogEntry[];
}

const getActionColor = (action: string) => {
    if (action === 'buy') return 'text-green-400';
    if (action === 'sell') return 'text-red-400';
    return 'text-gray-400';
}

export const AnalysisLog: React.FC<AnalysisLogProps> = ({ logEntries }) => {
    return (
        <Card>
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Live Analysis Log</h2>
            {logEntries.length === 0 ? (
                <div className="text-center py-10">
                    <p className="text-gray-400">Connect to the Binance Live Feed to see real-time analysis.</p>
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
                                <th scope="col" className="px-4 py-3">Analysis</th>
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
                                    <td className="px-4 py-3 text-xs text-gray-400">{entry.analysisSummary}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};
