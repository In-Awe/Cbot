
import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { SimulationStatus } from '../types';

interface ConnectionPanelProps {
    isBinanceConnected: boolean;
    simulationStatus: SimulationStatus;
    onBinanceConnect: (binanceApiKey: string, binanceApiSecret: string) => void;
    onBinanceDisconnect: () => void;
}

const Label: React.FC<{ htmlFor: string, children: React.ReactNode }> = ({ htmlFor, children }) => (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-300 mb-1">
        {children}
    </label>
);

const StatusIndicator: React.FC<{ isConnected: boolean }> = ({ isConnected }) => (
    <div className="flex items-center space-x-2">
        <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></span>
        <span className="text-xs font-medium">{isConnected ? 'Connected' : 'Disconnected'}</span>
    </div>
);


export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
    isBinanceConnected,
    simulationStatus,
    onBinanceConnect,
    onBinanceDisconnect,
}) => {
    const [binanceKey, setBinanceKey] = useState('');
    const [binanceSecret, setBinanceSecret] = useState('');

    const handleBinanceConnectClick = () => {
        if (binanceKey) onBinanceConnect(binanceKey, binanceSecret);
        else alert('Please enter your Binance API Key.');
    };
    
    const isSimulating = simulationStatus !== 'stopped' && simulationStatus !== 'csv_complete';

    return (
        <Card>
            <h3 className="text-lg font-semibold text-cyan-400 mb-4">Connection Manager</h3>
            <div className="space-y-6">
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <h4 className="font-semibold text-gray-200">Binance Market Data</h4>
                        <StatusIndicator isConnected={isBinanceConnected} />
                    </div>
                    {isBinanceConnected ? (
                        <Button onClick={onBinanceDisconnect} variant="danger" className="w-full" disabled={isSimulating}>
                            Disconnect Binance
                        </Button>
                    ) : (
                        <>
                            <Label htmlFor="binance_api_key">Binance API Key</Label>
                            <Input 
                                id="binance_api_key" 
                                type="password" 
                                placeholder="For Live Market Data"
                                value={binanceKey}
                                onChange={(e) => setBinanceKey(e.target.value)}
                                disabled={isBinanceConnected}
                            />
                            <Label htmlFor="binance_api_secret">Binance API Secret</Label>
                            <Input 
                                id="binance_api_secret" 
                                type="password" 
                                placeholder="Required for live trading"
                                value={binanceSecret}
                                onChange={(e) => setBinanceSecret(e.target.value)}
                                disabled={isBinanceConnected}
                            />
                            <Button onClick={handleBinanceConnectClick} className="w-full">
                                Connect Binance
                            </Button>
                        </>
                    )}
                </div>
            </div>
             <p className="text-xs text-gray-500 text-center pt-4 mt-4 border-t border-gray-700">
                Your keys are stored locally and never leave your browser.
            </p>
        </Card>
    );
};
