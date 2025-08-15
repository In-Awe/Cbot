
import React, { useMemo } from 'react';
import { Card } from './ui/Card';
import type { Trade, Signal } from '../types';

interface ScoreboardProps {
    openTrades: Trade[];
    closedTrades: Trade[];
    signals: Signal[];
}

const PnlCard: React.FC<{ title: string; value: number; className?: string }> = ({ title, value, className }) => {
    const pnlColor = value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-gray-300';
    const sign = value > 0 ? '+' : '';

    return (
        <div className={`bg-gray-900/50 p-4 rounded-lg text-center ${className}`}>
            <h4 className="text-sm text-gray-400 uppercase tracking-wider font-semibold">{title}</h4>
            <p className={`text-2xl font-bold mt-1 ${pnlColor}`}>
                {sign}${value.toFixed(2)}
            </p>
        </div>
    );
};

export const Scoreboard: React.FC<ScoreboardProps> = ({ openTrades, closedTrades, signals }) => {
    const realizedPnl = useMemo(() => {
        return closedTrades.reduce((acc, trade) => acc + (trade.pnl || 0), 0);
    }, [closedTrades]);

    const unrealizedPnl = useMemo(() => {
        const signalsMap = new Map(signals.map(s => [s.pair, s.last_price]));
        
        return openTrades
            .filter(trade => trade.status === 'active')
            .reduce((acc, trade) => {
                const currentPrice = signalsMap.get(trade.pair);
                if (!currentPrice) return acc;

                let pnl = 0;
                if (trade.direction === 'LONG') {
                    pnl = (currentPrice - trade.entryPrice) * (20 / trade.entryPrice); // Assuming trade amount for calculation
                } else {
                    pnl = (trade.entryPrice - currentPrice) * (20 / trade.entryPrice);
                }
                return acc + pnl;
            }, 0);
    }, [openTrades, signals]);
    
    const totalPnl = realizedPnl + unrealizedPnl;

    return (
        <Card>
            <h3 className="text-lg font-semibold text-cyan-400 mb-4">Performance Scoreboard</h3>
            <div className="space-y-3">
                <PnlCard title="Realized PNL" value={realizedPnl} />
                <PnlCard title="Unrealized PNL" value={unrealizedPnl} />
                <PnlCard title="Total PNL" value={totalPnl} className="border-t-2 border-cyan-500/30 pt-3" />
            </div>
        </Card>
    );
};
