import React, { useState, useEffect } from 'react';
import type { Trade } from '../types';
import { Button } from './ui/Button';

interface OpenPositionsRowProps {
    trade: Trade;
    onCloseTrade: (tradeId: string) => void;
    onConfirmTrade: (tradeId: string) => void;
    onUpdateTrade: (tradeId: string, updates: Partial<Pick<Trade, 'entryPrice' | 'takeProfit' | 'stopLoss'>>) => void;
}

const TableInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input 
        className="w-24 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        {...props}
    />
);

export const OpenPositionsRow: React.FC<OpenPositionsRowProps> = ({ trade, onCloseTrade, onConfirmTrade, onUpdateTrade }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editState, setEditState] = useState({
        entryPrice: trade.entryPrice,
        takeProfit: trade.takeProfit,
        stopLoss: trade.stopLoss,
    });
    
    useEffect(() => {
        setEditState({
            entryPrice: trade.entryPrice,
            takeProfit: trade.takeProfit,
            stopLoss: trade.stopLoss,
        });
    }, [trade]);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setEditState(prev => ({ ...prev, [name]: parseFloat(value) }));
    };

    const handleSave = () => {
        onUpdateTrade(trade.id, {
            entryPrice: editState.entryPrice,
            takeProfit: editState.takeProfit,
            stopLoss: editState.stopLoss,
        });
        setIsEditing(false);
    };
    
    const handleCancel = () => {
        setEditState({
            entryPrice: trade.entryPrice,
            takeProfit: trade.takeProfit,
            stopLoss: trade.stopLoss,
        });
        setIsEditing(false);
    }
    
    const isClosed = trade.status === 'closed';

    const getPnlColor = (pnl?: number) => {
        if (pnl === undefined) return 'text-gray-400';
        if (pnl > 0) return 'text-green-400';
        if (pnl < 0) return 'text-red-400';
        return 'text-gray-400';
    }

    return (
        <tr className={`border-b border-gray-700 hover:bg-gray-800/40 ${isClosed ? 'opacity-60' : ''}`}>
            <td scope="row" className="px-4 py-3 font-medium text-white whitespace-nowrap">{trade.pair}</td>
            <td className={`px-4 py-3 font-semibold ${trade.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>{trade.direction}</td>
            <td className="px-4 py-3">
                 <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                    trade.status === 'active' ? 'bg-cyan-500/20 text-cyan-300' :
                    trade.status === 'pending' ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-gray-600/20 text-gray-400'
                 }`}>
                    {trade.status}
                </span>
            </td>
            <td className="px-4 py-3 font-mono">${trade.tradeAmountUSD.toFixed(2)}</td>
            
            {isEditing && !isClosed ? (
                 <>
                    <td className="px-4 py-3"><TableInput type="number" name="entryPrice" value={editState.entryPrice} onChange={handleInputChange} /></td>
                    <td className="px-4 py-3 font-mono text-green-400"><TableInput type="number" name="takeProfit" value={editState.takeProfit} onChange={handleInputChange} /></td>
                    <td className="px-4 py-3 font-mono text-red-400"><TableInput type="number" name="stopLoss" value={editState.stopLoss} onChange={handleInputChange} /></td>
                 </>
            ) : (
                <>
                    <td className="px-4 py-3 font-mono">${trade.entryPrice.toFixed(4)}</td>
                    <td className="px-4 py-3 font-mono">{trade.exitPrice ? `$${trade.exitPrice.toFixed(4)}` : <span className="text-gray-500">N/A</span>}</td>
                    <td className={`px-4 py-3 font-mono font-semibold ${getPnlColor(trade.pnl)}`}>{trade.pnl ? `${trade.pnl > 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : <span className="text-gray-500">N/A</span>}</td>
                </>
            )}

            <td className="px-4 py-3 text-gray-400">{new Date(trade.openedAt).toLocaleTimeString()}</td>
            <td className="px-4 py-3 text-right">
                 {!isClosed && (
                    <div className="flex items-center justify-end gap-2">
                        {trade.status === 'pending' && (
                            <Button onClick={() => onConfirmTrade(trade.id)} variant="primary" className="py-1 px-2 text-xs">Confirm</Button>
                        )}
                        {trade.status === 'active' && (
                            isEditing ? (
                                <>
                                    <Button onClick={handleSave} variant="primary" className="py-1 px-2 text-xs">Save</Button>
                                    <Button onClick={handleCancel} variant="secondary" className="py-1 px-2 text-xs">Cancel</Button>
                                </>
                            ) : (
                                <>
                                    <Button onClick={() => setIsEditing(true)} variant="secondary" className="py-1 px-2 text-xs">Edit TP/SL</Button>
                                    <button onClick={() => onCloseTrade(trade.id)} className="font-medium text-red-500/80 hover:text-red-500 hover:underline text-xs">
                                        Close
                                    </button>
                                </>
                            )
                        )}
                        
                    </div>
                 )}
            </td>
        </tr>
    );
};