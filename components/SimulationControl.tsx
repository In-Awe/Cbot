import React from 'react';
import type { SimulationStatus } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { PlayIcon } from './icons/PlayIcon';
import { PauseIcon } from './icons/PauseIcon';
import { StopIcon } from './icons/StopIcon';
import { ForwardIcon } from './icons/ForwardIcon';

interface SimulationControlProps {
    status: SimulationStatus;
    onPlay: () => void;
    onPause: () => void;
    onStop: () => void;
    onAdvance: () => void;
    isDisabled: boolean;
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


export const SimulationControl: React.FC<SimulationControlProps> = ({ status, onPlay, onPause, onStop, onAdvance, isDisabled }) => {
    return (
        <Card>
            <h3 className="text-lg font-semibold text-cyan-400 mb-4">Simulation Control</h3>
            <div className="space-y-4">
                 <div className="flex items-center justify-center bg-gray-900/50 rounded-lg p-2">
                    <p className="text-sm font-medium text-gray-300">
                        Status: <span className="font-bold text-white capitalize">{status}</span>
                    </p>
                </div>
                <div className="flex gap-2">
                    {status === 'running' ? (
                        <ControlButton onClick={onPause} disabled={isDisabled} className="bg-yellow-600 hover:bg-yellow-500 text-white">
                            <PauseIcon /> Pause
                        </ControlButton>
                    ) : (
                         <ControlButton onClick={onPlay} disabled={isDisabled} className="bg-green-600 hover:bg-green-500 text-white">
                            <PlayIcon /> {status === 'paused' ? 'Resume' : 'Play'}
                        </ControlButton>
                    )}
                     <ControlButton onClick={onStop} disabled={isDisabled || status === 'stopped'} className="bg-red-600 hover:bg-red-500 text-white">
                        <StopIcon /> Stop
                    </ControlButton>
                </div>
                 {status === 'paused' && (
                    <Button onClick={onAdvance} disabled={isDisabled} variant="secondary" className="w-full flex items-center justify-center gap-2">
                        <ForwardIcon /> Advance 1 Tick
                    </Button>
                )}
            </div>
        </Card>
    );
};