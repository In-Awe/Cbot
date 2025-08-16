
import React from 'react';
import type { Trade } from '../types';

interface OpenPositionsRowProps {
    trade: Trade;
}

export const OpenPositionsRow: React.FC<OpenPositionsRowProps> = ({ trade }) => {
    const isClosed = trade.status === 'closed';

    const getPnlColor = (pnl?: number) => {
        if (pnl === undefined) return 'text-gray-400';
        if (pnl > 0) return 'text-green-400';
        if (pnl < 0) return 'text-red-400';
        return 'text-gray-400';
    }
    
    const stopLossStyle = trade.stopLoss === trade.entryPrice 
        ? 'text-cyan-400' 
        : (trade.direction === 'LONG' && trade.stopLoss > trade.initialStopLoss) || (trade.direction === 'SHORT' && trade.stopLoss < trade.initialStopLoss)
        ? 'text-yellow-400'
        : 'text-red-400';

    return (
        <tr className={`border-b border-gray-700 hover:bg-gray-800/40 ${isClosed ? 'opacity-60' : ''}`} title={`Initial SL: $${trade.initialStopLoss.toFixed(4)}`}>
            <td scope="row" className="px-4 py-3 font-medium text-white whitespace-nowrap">{trade.pair}</td>
            <td className={`px-4 py-3 font-semibold ${trade.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>{trade.direction}</td>
            <td className="px-4 py-3">
                 <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                    trade.status === 'active' ? 'bg-cyan-500/20 text-cyan-300' :
                    'bg-gray-600/20 text-gray-400'
                 }`}>
                    {trade.tp2Hit ? 'Trailing' : trade.tp1Hit ? 'Breakeven' : trade.status}
                </span>
            </td>
            <td className="px-4 py-3 font-mono">{trade.sizeUnits.toFixed(4)}</td>
            <td className="px-4 py-3 font-mono">${trade.entryPrice.toFixed(4)}</td>
            <td className={`px-4 py-3 font-mono ${stopLossStyle}`}>${trade.stopLoss.toFixed(4)}</td>
            <td className="px-4 py-3 font-mono">{trade.exitPrice ? `$${trade.exitPrice.toFixed(4)}` : <span className="text-gray-500">N/A</span>}</td>
            <td className={`px-4 py-3 font-mono font-semibold ${getPnlColor(trade.pnl)}`}>{trade.pnl ? `${trade.pnl > 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : <span className="text-gray-500">N/A</span>}</td>
            <td className="px-4 py-3 text-gray-400">{new Date(trade.openedAt).toLocaleTimeString()}</td>
        </tr>
    );
};
