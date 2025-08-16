
import React from 'react';
import type { HeatScores } from '../types';
import { Card } from './ui/Card';

interface HeatTrackerProps {
    heatScores: HeatScores | null;
    dailyTradeCount: number;
    dailyTradeLimit: number;
    lastUpdated: Date | null;
}

const HeatBar: React.FC<{ label: string, percentage: number, direction: 'buy' | 'sell' }> = ({ label, percentage, direction }) => {
    const clampedPercentage = Math.max(0, Math.min(100, percentage));
    
    const gradient = direction === 'buy'
        ? 'from-cyan-600 to-green-500'
        : 'from-yellow-500 to-red-500';

    const bgColor = direction === 'buy' ? 'bg-green-500/10' : 'bg-red-500/10';
    
    const textColor = clampedPercentage > 50 ? 'text-white' : 'text-gray-200';

    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-medium">
                <span className="text-gray-300 uppercase tracking-wider">{label}</span>
                <span className={`${direction === 'buy' ? 'text-green-300' : 'text-red-300'} font-bold`}>{clampedPercentage.toFixed(0)}%</span>
            </div>
            <div className={`w-full ${bgColor} rounded-full h-5 overflow-hidden border border-gray-700/50`}>
                <div 
                    className={`bg-gradient-to-r ${gradient} h-full rounded-full flex items-center justify-end px-2 transition-all duration-500 ease-out`}
                    style={{ width: `${clampedPercentage}%` }}
                >
                   {clampedPercentage > 15 && <span className={`text-xs font-bold ${textColor}`}>{clampedPercentage.toFixed(0)}%</span>}
                </div>
            </div>
        </div>
    );
};

const HeatTrackerSkeleton: React.FC = () => (
    <div className="space-y-6 animate-pulse">
        <div className="space-y-3">
            <div className="h-5 bg-gray-700 rounded w-1/3 mb-4"></div>
            <div className="h-5 bg-gray-700 rounded-full w-full"></div>
            <div className="h-5 bg-gray-700 rounded-full w-full"></div>
        </div>
    </div>
);

export const HeatTracker: React.FC<HeatTrackerProps> = ({ heatScores, dailyTradeCount, dailyTradeLimit, lastUpdated }) => {
    return (
        <Card>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-2">
                <div>
                    <h2 className="text-2xl font-bold text-gray-100">XRP/USDT Impulse Tracker</h2>
                     <p className="text-xs text-gray-400 mt-1">
                        Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '...'}
                    </p>
                </div>
                <div className="text-sm text-gray-400 bg-gray-900/50 px-3 py-1.5 rounded-md self-start sm:self-center">
                    Daily Trades: <span className="font-bold text-white">{dailyTradeCount} / {dailyTradeLimit}</span>
                </div>
            </div>

            {!heatScores || !heatScores['1s'] ? (
                <HeatTrackerSkeleton />
            ) : (
                <div className="space-y-8">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-200 mb-3 border-b border-gray-700/50 pb-2">1 Second Impulse</h3>
                        <div className="space-y-4">
                           <HeatBar label="Buy Impulse" percentage={heatScores['1s'].buy} direction="buy" />
                           <HeatBar label="Sell Impulse" percentage={heatScores['1s'].sell} direction="sell" />
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
};