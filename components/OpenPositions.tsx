
import React from 'react';
import type { Trade } from '../types';
import { Card } from './ui/Card';

interface OpenPositionsProps {
    trades: Trade[];
    onCloseTrade: (tradeId: string) => void;
}

export const OpenPositions: React.FC<OpenPositionsProps> = ({ trades, onCloseTrade }) => {
    return (
        <Card>
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Open Positions ({trades.length})</h2>
            {trades.length === 0 ? (
                <div className="text-center py-10">
                    <p className="text-gray-400">No open positions. Open a trade from the Signal Dashboard.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-800/50">
                            <tr>
                                <th scope="col" className="px-6 py-3">Pair</th>
                                <th scope="col" className="px-6 py-3">Direction</th>
                                <th scope="col" className="px-6 py-3">Entry Price</th>
                                <th scope="col" className="px-6 py-3">Take Profit</th>
                                <th scope="col" className="px-6 py-3">Stop Loss</th>
                                <th scope="col" className="px-6 py-3">Opened At</th>
                                <th scope="col" className="px-6 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {trades.map(trade => (
                                <tr key={trade.id} className="border-b border-gray-700 hover:bg-gray-800/40">
                                    <th scope="row" className="px-6 py-4 font-medium text-white whitespace-nowrap">{trade.pair}</th>
                                    <td className={`px-6 py-4 font-semibold ${trade.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                                        {trade.direction}
                                    </td>
                                    <td className="px-6 py-4 font-mono">${trade.entryPrice.toFixed(4)}</td>
                                    <td className="px-6 py-4 font-mono text-green-400">${trade.takeProfit.toFixed(4)}</td>
                                    <td className="px-6 py-4 font-mono text-red-400">${trade.stopLoss.toFixed(4)}</td>
                                    <td className="px-6 py-4">{trade.openedAt.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => onCloseTrade(trade.id)} className="font-medium text-red-500 hover:underline">
                                            Close
                                        </button>
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
