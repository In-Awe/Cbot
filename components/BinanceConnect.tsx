import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

interface BinanceConnectProps {
    isLive: boolean;
    onConnect: (apiKey: string) => void;
    onDisconnect: () => void;
}

const Label: React.FC<{ htmlFor: string, children: React.ReactNode }> = ({ htmlFor, children }) => (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-300 mb-1">
        {children}
    </label>
);

export const BinanceConnect: React.FC<BinanceConnectProps> = ({ isLive, onConnect, onDisconnect }) => {
    const [apiKey, setApiKey] = useState('');

    const handleConnectClick = () => {
        if (apiKey) {
            onConnect(apiKey);
        } else {
            alert('Please enter your Gemini API Key.');
        }
    };

    const connectionStatusClasses = isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-500';
    const connectionStatusText = isLive ? 'Connected' : 'Disconnected';

    return (
        <Card>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-cyan-400">AI Live Feed (Gemini)</h3>
                <div className="flex items-center space-x-2">
                    <span className={`h-3 w-3 rounded-full ${connectionStatusClasses}`}></span>
                    <span className="text-sm font-medium">{connectionStatusText}</span>
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
                        disabled={isLive}
                    />
                </div>
                {isLive ? (
                    <Button onClick={onDisconnect} variant="danger" className="w-full">
                        Disconnect
                    </Button>
                ) : (
                    <Button onClick={handleConnectClick} className="w-full">
                        Connect
                    </Button>
                )}
                <p className="text-xs text-gray-500 text-center pt-1">
                    Your key is stored only in your browser session and is required for analysis.
                </p>
            </div>
        </Card>
    );
};