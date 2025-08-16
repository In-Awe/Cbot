
import React from 'react';
import type { PendingOrder } from '../types';

interface PendingOrderCardProps {
    order: PendingOrder;
}

const getActionClasses = (direction: 'BUY' | 'SELL') => {
    switch (direction) {
        case 'BUY': return 'bg-green-500/10 text-green-400 border-green-500/30';
        case 'SELL': return 'bg-red-500/10 text-red-400 border-red-500/30';
    }
};

export const PendingOrderCard: React.FC<PendingOrderCardProps> = ({ order }) => {
    const actionClasses = getActionClasses(order.direction);

    return (
        <div className={`rounded-lg border p-5 flex flex-col justify-between transition-all duration-300 ${actionClasses} bg-opacity-10`}>
            <div>
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-2xl font-bold text-gray-100">{order.pair}</h3>
                        <p className="text-sm text-gray-400">Waiting for breakout...</p>
                    </div>
                    <span className={`px-4 py-1.5 rounded-full text-lg font-bold uppercase tracking-wider ${actionClasses.replace('border-green-500/30', '').replace('border-red-500/30','')}`}>
                        {order.direction}
                    </span>
                </div>

                <div className="space-y-3 text-sm mt-4 border-t border-gray-700/50 pt-3">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">Entry Price</span>
                        <span className="font-semibold text-gray-200 font-mono">${order.entryPrice.toFixed(4)}</span>
                    </div>
                     <div className="flex justify-between items-center">
                        <span className="text-gray-400">Stop Loss</span>
                        <span className="font-semibold text-gray-200 font-mono">${order.stopLoss.toFixed(4)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
