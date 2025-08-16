
import React from 'react';
import type { TradeSetup, SimulationStatus } from '../types';
import { SetupCard } from './SignalCard';
import { Card } from './ui/Card';

interface SetupDashboardProps {
    setups: TradeSetup[];
    isLoading: boolean;
    status: SimulationStatus;
    dailyTradeCount: number;
    dailyTradeLimit: number;
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


export const SetupDashboard: React.FC<SetupDashboardProps> = ({ setups, isLoading, status, dailyTradeCount, dailyTradeLimit }) => {
    
    const dailyLimitReached = dailyTradeCount >= dailyTradeLimit;
    const hasSetups = setups.length > 0;

    const getHelperText = () => {
        if (isLoading) return null;
        if (dailyLimitReached) {
            return "Daily trade limit reached. The bot will resume scanning tomorrow.";
        }
        if (status === 'stopped' || status === 'csv_complete') {
            return "Start live analysis or run a CSV simulation to find trade setups.";
        }
        if (!hasSetups) {
            return "No high-conviction setups found. The bot is actively monitoring the market.";
        }
        return null;
    }

    const helperText = getHelperText();

    return (
        <Card>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-100">High-Conviction Setups</h2>
                <div className="text-sm text-gray-400">
                    Daily Trades: <span className="font-bold text-white">{dailyTradeCount} / {dailyTradeLimit}</span>
                </div>
            </div>
            {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
            )}

            {!isLoading && helperText && (
                <div className="text-center py-10">
                    <p className="text-gray-400">{helperText}</p>
                </div>
            )}
            
            {!isLoading && hasSetups && !dailyLimitReached && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {setups.map(setup => (
                        <SetupCard 
                            key={setup.timestamp.getTime()} 
                            setup={setup}
                        />
                    ))}
                </div>
            )}
        </Card>
    );
};