import React, { useMemo } from 'react';
import type { PredictionAccuracyRecord } from '../types';
import { Card } from './ui/Card';

interface PredictionAccuracyProps {
    records: PredictionAccuracyRecord[];
}

const StatCard: React.FC<{ title: string; value: string; subvalue?: string }> = ({ title, value, subvalue }) => (
    <div className="bg-gray-900/50 p-3 rounded-lg text-center">
        <h4 className="text-xs text-gray-400 uppercase tracking-wider font-semibold">{title}</h4>
        <p className="text-xl font-bold mt-1 text-cyan-300">{value}</p>
        {subvalue && <p className="text-xs text-gray-500">{subvalue}</p>}
    </div>
);

export const PredictionAccuracy: React.FC<PredictionAccuracyProps> = ({ records }) => {
    const stats = useMemo(() => {
        const resolved = records.filter(r => r.status === 'resolved');
        const grouped: Record<string, { wins: number; total: number }> = {};

        for (const record of resolved) {
            const key = `${record.timeframe} ${record.predictedSignal}`;
            if (!grouped[key]) {
                grouped[key] = { wins: 0, total: 0 };
            }
            if (record.success) {
                grouped[key].wins++;
            }
            grouped[key].total++;
        }
        
        const overallWins = Object.values(grouped).reduce((sum, item) => sum + item.wins, 0);
        const overallTotal = Object.values(grouped).reduce((sum, item) => sum + item.total, 0);

        return {
            overallWins,
            overallTotal,
            overallWinRate: overallTotal > 0 ? (overallWins / overallTotal) * 100 : 0,
            pendingCount: records.filter(r => r.status === 'pending').length,
            details: Object.entries(grouped).map(([key, { wins, total }]) => ({
                key,
                wins,
                total,
                winRate: total > 0 ? (wins / total) * 100 : 0,
            })).sort((a,b) => b.total - a.total),
        };
    }, [records]);

    return (
        <Card>
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Timeframe Prediction Accuracy</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <StatCard 
                    title="Overall Win Rate" 
                    value={`${stats.overallWinRate.toFixed(1)}%`}
                    subvalue={`${stats.overallWins} W / ${stats.overallTotal} L`}
                />
                <StatCard title="Resolved Predictions" value={stats.overallTotal.toString()} />
                <StatCard title="Pending Predictions" value={stats.pendingCount.toString()} />
            </div>

            {stats.details.length === 0 ? (
                 <div className="text-center py-6">
                    <p className="text-gray-400">No resolved predictions yet. Data will appear here as the simulation runs.</p>
                </div>
            ) : (
                 <div className="overflow-x-auto max-h-60 overflow-y-auto">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th scope="col" className="px-4 py-3">Prediction Type</th>
                                <th scope="col" className="px-4 py-3">Win Rate</th>
                                <th scope="col" className="px-4 py-3">Wins</th>
                                <th scope="col" className="px-4 py-3">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {stats.details.map(stat => (
                                <tr key={stat.key} className="hover:bg-gray-800/40">
                                    <td className="px-4 py-2 font-medium text-white capitalize">{stat.key}</td>
                                    <td className="px-4 py-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold w-12">{stat.winRate.toFixed(1)}%</span>
                                            <div className="w-full bg-gray-700 rounded-full h-1.5">
                                                <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${stat.winRate}%` }}></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-green-400">{stat.wins}</td>
                                    <td className="px-4 py-2">{stat.total}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};
