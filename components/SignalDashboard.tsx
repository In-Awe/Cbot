import React from 'react';
import type { PendingOrder } from '../types';
import { PendingOrderCard } from './SignalCard';
import { Card } from './ui/Card';

interface SignalDashboardProps {
    pendingOrders: PendingOrder[];
    isLoading: boolean;
}

const SkeletonCard: React.FC = () => (
    <div className="bg-gray-800/50 p-4 rounded-lg animate-pulse">
        <div className="flex justify-between items-center mb-4">
            <div className="h-6 bg-gray-700 rounded w-1/3"></div>
            <div className="h-8 bg-gray-700 rounded w-1/4"></div>
        </div>
        <div className="space-y-2">
            <div className="h-4 bg-gray-700 rounded w-1/2"></div>
            <div className="h-4 bg-gray-700 rounded w-2/3"></div>
        </div>
    </div>
);


export const SignalDashboard: React.FC<SignalDashboardProps> = ({ pendingOrders, isLoading }) => {
    
    return (
        <Card>
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Pending Orders</h2>
            {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
            )}

            {!isLoading && pendingOrders.length === 0 && (
                <div className="text-center py-10">
                    <p className="text-gray-400">No pending orders. The bot is waiting for a volatility squeeze.</p>
                </div>
            )}
            
            {!isLoading && pendingOrders.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {pendingOrders.map(order => (
                        <PendingOrderCard 
                            key={order.pair} 
                            order={order}
                        />
                    ))}
                </div>
            )}
        </Card>
    );
};