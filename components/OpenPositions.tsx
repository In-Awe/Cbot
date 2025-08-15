import React from 'react';
import type { Trade } from '../types';
import { Card } from './ui/Card';
import { OpenPositionsRow } from './OpenPositionsRow';

interface OpenPositionsProps {
    trades: Trade[];
    onCloseTrade: (tradeId: string) => void;
    onConfirmTrade: (tradeId: string) => void;
    onUpdateTrade: (tradeId: string, updates: Partial<Pick<Trade, 'entryPrice' | 'takeProfit' | 'stopLoss'>>) => void;
}

export const OpenPositions: React.FC<OpenPositionsProps> = ({ trades, onCloseTrade, onConfirmTrade, onUpdateTrade }) => {
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
                                <th scope="col" className="px-4 py-3">Pair</th>
                                <th scope="col" className="px-4 py-3">Direction</th>
                                <th scope="col" className="px-4 py-3">Status</th>
                                <th scope="col" className="px-4 py-3">Entry Price</th>
                                <th scope="col" className="px-4 py-3">Take Profit</th>
                                <th scope="col" className="px-4 py-3">Stop Loss</th>
                                <th scope="col" className="px-4 py-3">Opened At</th>
                                <th scope="col" className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trades.map(trade => (
                                <OpenPositionsRow
                                    key={trade.id}
                                    trade={trade}
                                    onCloseTrade={onCloseTrade}
                                    onConfirmTrade={onConfirmTrade}
                                    onUpdateTrade={onUpdateTrade}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};
