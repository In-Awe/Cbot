import React from 'react';
import type { SimulationStatus } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { PlayIcon } from './icons/PlayIcon';
import { StopIcon } from './icons/StopIcon';

interface SimulationControlProps {
    status: SimulationStatus;
    onPlay: () => void;
    onStop: () => void;
    isBinanceConnected: boolean;
}

const getStatusText = (status: SimulationStatus) => {
    const statusMap: Record<SimulationStatus, string> = {
        stopped: 'Stopped',
        live: 'Live Analysis',
        paused: 'Paused',
        csv_simulating: 'CSV Simulating',
        csv_complete: 'CSV Sim Complete',
    };
    return statusMap[status] || 'Unknown';
}


export const SimulationControl: React.FC<SimulationControlProps> = ({ status, onPlay, onStop, isBinanceConnected }) => {
    
    const isLiveMode = status === 'live';
    const canStartLive = status === 'stopped' && isBinanceConnected;
    const canStop = status === 'live';
    const isSimulating = status === 'live' || status === 'csv_simulating';

    return (
        <Card>
            <h3 className="text-lg font-semibold text-cyan-400 mb-4">Simulation Control</h3>
            <div className="space-y-4">
                <div className="flex items-center justify-center bg-gray-900/50 rounded-lg p-2">
                    <p className="text-sm font-medium text-gray-300">
                        Status: <span className={`font-bold text-white capitalize ${isSimulating ? 'text-yellow-400 animate-pulse' : ''}`}>{getStatusText(status)}</span>
                    </p>
                </div>
                
                <div className="flex gap-2">
                    <Button onClick={onPlay} disabled={!canStartLive} className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white">
                        <PlayIcon /> Start Live
                    </Button>
                     <Button onClick={onStop} disabled={!canStop} className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white">
                        <StopIcon /> Stop
                    </Button>
                </div>
                 {!isBinanceConnected && status === 'stopped' && (
                    <p className="text-xs text-yellow-400 text-center">Connect to Binance to enable live trading analysis.</p>
                 )}
            </div>
        </Card>
    );
};