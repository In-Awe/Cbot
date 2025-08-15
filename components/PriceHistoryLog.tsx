import React from 'react';
import type { PriceHistoryLogEntry } from '../types';
import { Card } from './ui/Card';
import { DownloadIcon } from './icons/DownloadIcon';
import { Button } from './ui/Button';

interface PriceHistoryLogProps {
    logEntries: PriceHistoryLogEntry[];
    onExport: () => void;
    onFetchPrices: () => void;
}

export const PriceHistoryLog: React.FC<PriceHistoryLogProps> = ({ logEntries, onExport, onFetchPrices }) => {
    return (
        <Card>
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-100">Price History Log</h2>
                <div className="flex items-center gap-2">
                    <Button onClick={onFetchPrices} variant="secondary" className="py-1.5 px-3 text-xs">Fetch Prices</Button>
                    <button 
                        onClick={onExport}
                        disabled={logEntries.length === 0}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-300 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <DownloadIcon />
                        <span>Download CSV</span>
                    </button>
                </div>
            </div>
            
            {logEntries.length === 0 ? (
                <div className="text-center py-10">
                    <p className="text-gray-400">No price data. Fetch prices or start the simulation.</p>
                </div>
            ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th scope="col" className="px-4 py-3">Time</th>
                                <th scope="col" className="px-4 py-3">Pair</th>
                                <th scope="col" className="px-4 py-3">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logEntries.map(entry => (
                                <tr key={entry.id} className="border-b border-gray-700 hover:bg-gray-800/40">
                                    <td className="px-4 py-3 whitespace-nowrap">{entry.timestamp.toLocaleTimeString()}</td>
                                    <td className="px-4 py-3 font-medium text-white">{entry.pair}</td>
                                    <td className="px-4 py-3 font-mono">${entry.price.toFixed(4)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};
