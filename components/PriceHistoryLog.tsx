import React, { useState, useEffect } from 'react';
import type { PriceHistoryLogEntry } from '../types';
import { Card } from './ui/Card';
import { DownloadIcon } from './icons/DownloadIcon';
import { Button } from './ui/Button';

interface PriceHistoryLogProps {
    trading_pairs: string[];
    logData: Record<string, PriceHistoryLogEntry[]>;
    logCounts: Record<string, number>;
    onExport: (pair: string, interval: '1m' | '15s') => void;
    onFetchPrices: () => void;
}

export const PriceHistoryLog: React.FC<PriceHistoryLogProps> = ({ trading_pairs, logData, logCounts, onExport, onFetchPrices }) => {
    const [activePair, setActivePair] = useState<string | null>(null);

    useEffect(() => {
        if (!activePair && trading_pairs.length > 0) {
            setActivePair(trading_pairs[0]);
        } else if (activePair && !trading_pairs.includes(activePair)) {
            setActivePair(trading_pairs.length > 0 ? trading_pairs[0] : null);
        }
    }, [trading_pairs, activePair]);

    const activeLogEntries = activePair ? logData[activePair] || [] : [];
    const totalRecords = activePair ? logCounts[activePair] || 0 : 0;

    return (
        <Card>
             <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-100">Historical Data Explorer</h2>
                    {activePair && (
                        <p className="text-xs text-gray-400 mt-1">
                            Showing latest {activeLogEntries.length} of {totalRecords.toLocaleString()} records for {activePair}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
                    <Button onClick={onFetchPrices} variant="secondary" className="py-1.5 px-3 text-xs">Fetch Prices</Button>
                    <button 
                        onClick={() => activePair && onExport(activePair, '1m')}
                        disabled={!activePair || totalRecords === 0}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-300 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <DownloadIcon />
                        <span>Export 1m (CSV)</span>
                    </button>
                     <button 
                        onClick={() => activePair && onExport(activePair, '15s')}
                        disabled={!activePair || totalRecords === 0}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-300 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <DownloadIcon />
                        <span>Export 15s (CSV)</span>
                    </button>
                </div>
            </div>

            <div className="border-b border-gray-700 mb-4">
                <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                    {trading_pairs.map((pair) => (
                        <button
                            key={pair}
                            onClick={() => setActivePair(pair)}
                            className={`flex-shrink-0 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors
                                ${ activePair === pair
                                ? 'border-cyan-400 text-cyan-300'
                                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                                }`}
                        >
                            {pair}
                        </button>
                    ))}
                </nav>
            </div>
            
            {activeLogEntries.length === 0 ? (
                <div className="text-center py-10">
                    <p className="text-gray-400">No price data for {activePair}. Connect to Binance to backfill historical data.</p>
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
                            {activeLogEntries.map(entry => (
                                <tr key={entry.id} className="border-b border-gray-700 hover:bg-gray-800/40">
                                    <td className="px-4 py-3 whitespace-nowrap">{new Date(entry.timestamp).toLocaleTimeString()}</td>
                                    <td className="px-4 py-3 font-mono">${entry.close.toFixed(4)}</td>
                                    <td className="px-4 py-3 font-mono text-gray-400">{entry.open ? `$${entry.open.toFixed(4)}` : '-'}</td>
                                    <td className="px-4 py-3 font-mono text-gray-400">{entry.high ? `$${entry.high.toFixed(4)}` : '-'}</td>
                                    <td className="px-4 py-3 font-mono text-gray-400">{entry.low ? `$${entry.low.toFixed(4)}` : '-'}</td>
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