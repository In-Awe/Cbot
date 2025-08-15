
import React, { useState, useEffect } from 'react';
import type { PriceHistoryLogEntry } from '../types';
import { Card } from './ui/Card';
import { DownloadIcon } from './icons/DownloadIcon';
import { Button } from './ui/Button';

interface PriceHistoryLogProps {
    trading_pairs: string[];
    logData: Record<string, PriceHistoryLogEntry[]>;
    onExport: (pair: string) => void;
    onFetchPrices: () => void;
}

export const PriceHistoryLog: React.FC<PriceHistoryLogProps> = ({ trading_pairs, logData, onExport, onFetchPrices }) => {
    const [activePair, setActivePair] = useState<string | null>(null);

    useEffect(() => {
        if (!activePair && trading_pairs.length > 0) {
            setActivePair(trading_pairs[0]);
        } else if (activePair && !trading_pairs.includes(activePair)) {
            setActivePair(trading_pairs.length > 0 ? trading_pairs[0] : null);
        }
    }, [trading_pairs, activePair]);

    const activeLogEntries = activePair ? logData[activePair] || [] : [];

    return (
        <Card>
             <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-100">Price History Log</h2>
                <div className="flex items-center gap-2">
                    <Button onClick={onFetchPrices} variant="secondary" className="py-1.5 px-3 text-xs">Fetch Prices</Button>
                    <button 
                        onClick={() => activePair && onExport(activePair)}
                        disabled={!activePair || activeLogEntries.length === 0}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-300 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <DownloadIcon />
                        <span>Export CSV</span>
                    </button>
                </div>
            </div>

            <div className="border-b border-gray-700 mb-4">
                <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                    {trading_pairs.map((pair) => (
                        <button
                            key={pair}
                            onClick={() => setActivePair(pair)}
                            className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors
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
                    <p className="text-gray-400">No price data for {activePair}. Fetch prices or start the simulation.</p>
                </div>
            ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th scope="col" className="px-4 py-3">Time</th>
                                <th scope="col" className="px-4 py-3">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeLogEntries.map(entry => (
                                <tr key={entry.id} className="border-b border-gray-700 hover:bg-gray-800/40">
                                    <td className="px-4 py-3 whitespace-nowrap">{new Date(entry.timestamp).toLocaleTimeString()}</td>
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
