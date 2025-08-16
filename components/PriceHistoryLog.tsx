import React from 'react';
import type { PriceHistoryLogEntry } from '../types';
import { Card } from './ui/Card';
import { DownloadIcon } from './icons/DownloadIcon';

interface LivePriceFeedProps {
    candles: PriceHistoryLogEntry[];
    onExport: () => void;
}

export const LivePriceFeed: React.FC<LivePriceFeedProps> = ({ candles, onExport }) => {

    return (
        <Card>
             <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-100">Live Price Feed</h2>
                    <p className="text-xs text-gray-400 mt-1">
                        Showing latest ~100 1-second price candles from Binance.
                    </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
                    <button 
                        onClick={onExport}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-300 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <DownloadIcon />
                        <span>Export 1m History (CSV)</span>
                    </button>
                </div>
            </div>
            
            {candles.length === 0 ? (
                <div className="text-center py-10">
                    <p className="text-gray-400">No live price data. Start the simulation to begin streaming from Binance.</p>
                </div>
            ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th scope="col" className="px-4 py-3">Time</th>
                                <th scope="col" className="px-4 py-3">Price (Close)</th>
                                <th scope="col" className="px-4 py-3">Open</th>
                                <th scope="col" className="px-4 py-3">High</th>
                                <th scope="col" className="px-4 py-3">Low</th>
                                <th scope="col" className="px-4 py-3">Volume</th>
                            </tr>
                        </thead>
                        <tbody>
                            {candles.map((entry, index) => (
                                <tr 
                                    key={entry.id} 
                                    className={`border-b border-gray-700 transition-colors duration-500 ${index === 0 ? 'bg-cyan-500/10' : 'hover:bg-gray-800/40'}`}
                                >
                                    <td className="px-4 py-3 whitespace-nowrap">{new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })}.{entry.timestamp.getMilliseconds().toString().padStart(3, '0')}</td>
                                    <td className="px-4 py-3 font-mono text-white">${entry.close.toFixed(2)}</td>
                                    <td className="px-4 py-3 font-mono text-gray-400">{entry.open ? `$${entry.open.toFixed(2)}` : '-'}</td>
                                    <td className="px-4 py-3 font-mono text-green-400">{entry.high ? `$${entry.high.toFixed(2)}` : '-'}</td>
                                    <td className="px-4 py-3 font-mono text-red-400">{entry.low ? `$${entry.low.toFixed(2)}` : '-'}</td>
                                    <td className="px-4 py-3 font-mono text-gray-400">{entry.volume ? entry.volume.toFixed(2) : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};