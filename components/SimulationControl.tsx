import React from 'react';
import type { SimulationStatus, AnalysisEngine } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { PlayIcon } from './icons/PlayIcon';
import { PauseIcon } from './icons/PauseIcon';
import { StopIcon } from './icons/StopIcon';
import { ForwardIcon } from './icons/ForwardIcon';

interface SimulationControlProps {
    status: SimulationStatus;
    analysisEngine: AnalysisEngine;
    onPlay: () => void;
    onPause: () => void;
    onStop: () => void;
    onAdvance: () => void;
    onManualAnalysis: () => void;
    onEngineChange: (engine: AnalysisEngine) => void;
    onRunBacktest: () => void;
    backtestProgress: number;
    isDisabled: boolean;
    isManualDisabled: boolean;
}

const ControlButton: React.FC<{onClick: () => void, disabled: boolean, children: React.ReactNode, className?: string}> = ({ onClick, disabled, children, className }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
        {children}
    </button>
);

const getStatusText = (status: SimulationStatus) => {
    if (status === 'backtest_complete') return 'Backtest Complete';
    return status;
}


export const SimulationControl: React.FC<SimulationControlProps> = ({ status, analysisEngine, onPlay, onPause, onStop, onAdvance, onManualAnalysis, onEngineChange, onRunBacktest, backtestProgress, isDisabled, isManualDisabled }) => {
    
    const isLiveMode = status === 'running' || status === 'warming up';
    const canStartLive = status === 'stopped' || status === 'paused' || status === 'backtest_complete';
    const canStop = status !== 'stopped';
    const canRunBacktest = status === 'stopped' || status === 'backtest_complete';

    return (
        <Card>
            <h3 className="text-lg font-semibold text-cyan-400 mb-4">Simulation Control</h3>
            <div className="space-y-4">
                <div className="flex items-center justify-center bg-gray-900/50 rounded-lg p-2">
                    <p className="text-sm font-medium text-gray-300">
                        Status: <span className={`font-bold text-white capitalize ${status === 'warming up' || status === 'backtesting' ? 'text-yellow-400 animate-pulse' : ''}`}>{getStatusText(status)}</span>
                    </p>
                </div>
                
                 {status === 'backtesting' && (
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                        <div className="bg-cyan-500 h-2.5 rounded-full" style={{width: `${backtestProgress}%`}}></div>
                    </div>
                )}
                
                <div className="flex items-center bg-gray-900/50 rounded-lg p-1">
                    <button 
                        className={`flex-1 text-xs font-bold py-1.5 rounded ${analysisEngine === 'internal' ? 'bg-cyan-600 text-white' : 'text-gray-300'}`}
                        onClick={() => onEngineChange('internal')}
                        disabled={status !== 'stopped'}
                    >
                        Internal Bot
                    </button>
                    <button 
                        className={`flex-1 text-xs font-bold py-1.5 rounded ${analysisEngine === 'gemini' ? 'bg-cyan-600 text-white' : 'text-gray-300'}`}
                        onClick={() => onEngineChange('gemini')}
                        disabled={status !== 'stopped'}
                    >
                        Gemini API
                    </button>
                </div>

                <div className="flex gap-2">
                    {isLiveMode ? (
                        <ControlButton onClick={onPause} disabled={isDisabled} className="bg-yellow-600 hover:bg-yellow-500 text-white">
                            <PauseIcon /> Pause
                        </ControlButton>
                    ) : (
                         <ControlButton onClick={onPlay} disabled={isDisabled || !canStartLive} className="bg-green-600 hover:bg-green-500 text-white">
                            <PlayIcon /> {status === 'paused' ? 'Resume' : 'Start Live'}
                        </ControlButton>
                    )}
                     <ControlButton onClick={onStop} disabled={!canStop} className="bg-red-600 hover:bg-red-500 text-white">
                        <StopIcon /> Stop
                    </ControlButton>
                </div>
                <div className="space-y-2">
                    <Button onClick={onRunBacktest} disabled={isDisabled || !canRunBacktest} variant="secondary" className="w-full">
                       Run Backtest
                    </Button>
                     <Button onClick={onManualAnalysis} disabled={isManualDisabled || analysisEngine === 'internal'} variant="secondary" className="w-full">
                        Manual Gemini Analysis
                    </Button>
                </div>
            </div>
        </Card>
    );
};