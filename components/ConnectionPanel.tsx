import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { SimulationStatus } from '../types';

interface ConnectionPanelProps {
    isConnected: boolean;
    simulationStatus: SimulationStatus;
    onConnect: (apiKey: string) => void;
    onDisconnect: () => void;
}

const Label: React.FC<{ htmlFor: string, children: React.ReactNode }> = ({ htmlFor, children }) => (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-300 mb-1">
        {children}
    </label>
);

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ isConnected, simulationStatus, onConnect, onDisconnect }) => {
    const [apiKey, setApiKey] = useState('');

    const handleConnectClick = () => {
        if (apiKey) {
            onConnect(apiKey);
        } else {
            alert('Please enter your Gemini API Key.');
        }
    };

    const getStatusIndicator = () => {
        if (simulationStatus === 'running') {
            return {
                classes: 'bg-green-500 animate-pulse',
                text: 'Running'
            };
        }
        if (simulationStatus === 'paused') {
            return {
                classes: 'bg-yellow-500 animate-pulse',
                text: 'Paused'
            };
        }
        if (isConnected) {
            return {
                classes: 'bg-cyan-500',
                text: 'Connected'
            };
        }
        return {
            classes: 'bg-gray-500',
            text: 'Disconnected'
        };
    }
    
    const status = getStatusIndicator();

    return (
        <Card>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-cyan-400">Connection Panel</h3>
                <div className="flex items-center space-x-2">
                    <span className={`h-3 w-3 rounded-full ${status.classes}`}></span>
                    <span className="text-sm font-medium">{status.text}</span>
                </div>
            </div>
            <div className="space-y-4">
                <div>
                    <Label htmlFor="api_key">Gemini API Key</Label>
                    <Input 
                        id="api_key" 
                        name="api_key" 
                        type="password" 
                        placeholder="Enter your Gemini API Key"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        disabled={isConnected}
                    />
                </div>
                {isConnected ? (
                    <Button onClick={onDisconnect} variant="danger" className="w-full">
                        Disconnect
                    </Button>
                ) : (
                    <Button onClick={handleConnectClick} className="w-full">
                        Connect
                    </Button>
                )}
                <p className="text-xs text-gray-500 text-center pt-1">
                    Your key is required to power the AI simulation engine.
                </p>
            </div>
        </Card>
    );
};