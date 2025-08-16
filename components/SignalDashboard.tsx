import React, { useState } from 'react';
import type { Signal } from '../types';
import { SignalCard } from './SignalCard';
import { Card } from './ui/Card';

interface SignalDashboardProps {
    signals: Signal[];
    isLoading: boolean;
    onOpenTimeframeTrade: (pair: string, direction: 'LONG' | 'SHORT') => void;
    openTradePairs: string[];
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
            <div className="h-4 bg-gray-700 rounded w-1/2"></div>
        </div>
        <div className="mt-4 h-10 bg-gray-700 rounded w-full"></div>
    </div>
);


export const SignalDashboard: React.FC<SignalDashboardProps> = ({ signals, isLoading, onOpenTimeframeTrade, openTradePairs }) => {
    const [areDetailsExpanded, setAreDetailsExpanded] = useState(false);
    
    const handleToggleDetails = () => setAreDetailsExpanded(prev => !prev);
    
    return (
        <Card>
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Signal Dashboard</h2>
            {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
            )}

            {!isLoading && signals.length === 0 && (
                <div className="text-center py-10">
                    <p className="text-gray-400">Run an analysis from the Control Panel to see trading signals here.</p>
                </div>
            )}
            
            {!isLoading && signals.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {signals.map(signal => (
                        <SignalCard 
                            key={signal.pair} 
                            signal={signal} 
                            onOpenTimeframeTrade={onOpenTimeframeTrade}
                            isTradeOpen={openTradePairs.includes(signal.pair)}
                            isExpanded={areDetailsExpanded}
                            onToggleDetails={handleToggleDetails}
                            tradeAmountUSD={signal.betSizeUSD || 0}
                        />
                    ))}
                </div>
            )}
        </Card>
    );
};