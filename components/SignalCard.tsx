
import React from 'react';
import type { Signal, TimeframeAnalysis } from '../types';
import { Button } from './ui/Button';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ChevronUpIcon } from './icons/ChevronUpIcon';

interface SignalCardProps {
    signal: Signal;
    onOpenTimeframeTrade: (pair: string, direction: 'LONG' | 'SHORT') => void;
    isTradeOpen: boolean;
    isExpanded: boolean;
    onToggleDetails: () => void;
    tradeAmountUSD: number;
}

const getActionClasses = (action: 'buy' | 'sell' | 'hold') => {
    switch (action) {
        case 'buy': return 'bg-green-500/10 text-green-400 border-green-500/30';
        case 'sell': return 'bg-red-500/10 text-red-400 border-red-500/30';
        case 'hold': return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
};

const RegimeInfo: React.FC<{ regime: Signal['regime'] }> = ({ regime }) => {
    if (!regime) return null;
    return (
        <div className="flex justify-between items-center text-xs mt-3 pt-3 border-t border-gray-700/50">
            <div className="text-center px-2">
                <span className="text-gray-400 block">Trend</span>
                <span className={`font-bold ${regime.trend === 'Uptrend' ? 'text-green-400' : regime.trend === 'Downtrend' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {regime.trend}
                </span>
            </div>
            <div className="text-center px-2">
                <span className="text-gray-400 block">Volatility</span>
                <span className={`font-bold ${regime.volatility === 'High' ? 'text-red-400' : regime.volatility === 'Low' ? 'text-green-400' : 'text-yellow-400'}`}>
                    {regime.volatility}
                </span>
            </div>
        </div>
    );
};

const IndicatorDetails: React.FC<{ details: TimeframeAnalysis['details'] }> = ({ details }) => {
    if (!details) return null;
    
    const getVal = (key: string): number | undefined => {
        const val = details[key];
        return typeof val === 'number' ? val : undefined;
    }

    const rsi = getVal('rsi');
    const ema50 = getVal('ema50');
    const ema100 = getVal('ema100');
    const macdLine = getVal('macdLine');
    const signalLine = getVal('signalLine');

    const indicators = [
        { name: 'EMA Cross', value: `50: ${ema50?.toFixed(2) ?? '...'}`, passBuy: ema50 && ema100 ? ema50 > ema100 : false, passSell: ema50 && ema100 ? ema50 < ema100 : false },
        { name: 'RSI', value: rsi?.toFixed(2) ?? '...', passBuy: rsi ? rsi > 55 : false, passSell: rsi ? rsi < 45 : false },
        { name: 'MACD Cross', value: `M: ${macdLine?.toFixed(4) ?? '...'}`, passBuy: macdLine && signalLine ? macdLine > signalLine : false, passSell: macdLine && signalLine ? macdLine < signalLine : false },
    ];

    return (
        <div className="space-y-1.5 text-xs">
            {indicators.map(ind => (
                <div key={ind.name} className="grid grid-cols-4 items-center gap-2">
                    <span className="text-gray-400 col-span-1">{ind.name}</span>
                    <span className="font-mono text-gray-200 col-span-2">{ind.value}</span>
                    <div className="flex gap-1 justify-end">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white font-bold text-[10px] ${ind.passBuy ? 'bg-green-500' : 'bg-gray-600/50'}`} title="Buy condition met">B</span>
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white font-bold text-[10px] ${ind.passSell ? 'bg-red-500' : 'bg-gray-600/50'}`} title="Sell condition met">S</span>
                    </div>
                </div>
            ))}
        </div>
    );
};


export const SignalCard: React.FC<SignalCardProps> = ({ signal, onOpenTimeframeTrade, isTradeOpen, isExpanded, onToggleDetails, tradeAmountUSD }) => {
    const actionClasses = getActionClasses(signal.action);

    const { action, last_price, take_profit, stop_loss } = signal;
    let potentialProfitUSD = 0;
    let potentialLossUSD = 0;

    if (last_price && take_profit && stop_loss && last_price > 0 && tradeAmountUSD > 0) {
        if (action === 'buy') { // Long position
            potentialProfitUSD = tradeAmountUSD * ((take_profit - last_price) / last_price);
            potentialLossUSD = tradeAmountUSD * ((stop_loss - last_price) / last_price); // Will be negative
        } else if (action === 'sell') { // Short position
            potentialProfitUSD = tradeAmountUSD * ((last_price - take_profit) / last_price);
            potentialLossUSD = tradeAmountUSD * ((last_price - stop_loss) / last_price); // Will be negative
        }
    }

    return (
        <div className={`rounded-lg border p-5 flex flex-col justify-between transition-all duration-300 ${actionClasses} ${isExpanded ? 'bg-opacity-20' : ''}`}>
            <div>
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-2xl font-bold text-gray-100">{signal.pair}</h3>
                        <p className="text-sm text-gray-400">Last Price: ${signal.last_price?.toFixed(4)}</p>
                    </div>
                    <span className={`px-4 py-1.5 rounded-full text-lg font-bold uppercase tracking-wider ${actionClasses.replace('border-green-500/30', '').replace('border-red-500/30','').replace('border-gray-500/30', '')}`}>
                        {signal.action}
                    </span>
                </div>

                <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">Calibrated P(Win)</span>
                        <div className="w-1/2 bg-gray-700 rounded-full h-2.5">
                            <div className="bg-cyan-400 h-2.5 rounded-full" style={{ width: `${Math.round((signal.calibrated_win_p || 0) * 100)}%` }}></div>
                        </div>
                        <span className="font-semibold text-gray-200">{Math.round((signal.calibrated_win_p || 0) * 100)}%</span>
                    </div>
                     <div className="flex justify-between items-center">
                        <span className="text-gray-400">Take Profit</span>
                        <div className="text-right">
                            <span className="font-mono text-green-400">${signal.take_profit?.toFixed(4) ?? '...'}</span>
                            {potentialProfitUSD !== 0 && (
                                <span className="ml-2 text-xs text-green-500/80">({potentialProfitUSD > 0 ? '+' : ''}{potentialProfitUSD.toFixed(2)} USD)</span>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">Stop Loss</span>
                        <div className="text-right">
                            <span className="font-mono text-red-400">${signal.stop_loss?.toFixed(4) ?? '...'}</span>
                             {potentialLossUSD !== 0 && (
                                <span className="ml-2 text-xs text-red-500/80">({potentialLossUSD.toFixed(2)} USD)</span>
                            )}
                        </div>
                    </div>
                    {signal.note && <p className="text-xs text-yellow-500/80 pt-2 italic">Note: {signal.note}</p>}
                    
                    <RegimeInfo regime={signal.regime} />
                </div>
            </div>

            <div className="mt-5">
                {isExpanded && (
                    <div className="mb-5 border-t border-gray-700/50 pt-4 animate-fade-in space-y-4">
                         <div>
                             <h4 className="font-semibold mb-2 text-gray-300 text-sm">Live Indicator State</h4>
                             <IndicatorDetails details={signal.meta[0]?.details} />
                         </div>

                        {(signal.action === 'buy' || signal.action === 'sell') && (
                             <div>
                                <h4 className="font-semibold mb-2 text-gray-300 text-sm">Manual Trade</h4>
                                 <Button
                                    onClick={() => onOpenTimeframeTrade(signal.pair, signal.action === 'buy' ? 'LONG' : 'SHORT')}
                                    disabled={isTradeOpen}
                                    variant={signal.action === 'buy' ? 'primary' : 'danger'}
                                    className="w-full"
                                >
                                    {isTradeOpen ? 'Position Open' : `Open ${signal.action === 'buy' ? 'LONG' : 'SHORT'} Trade`}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <button onClick={onToggleDetails} className="w-full text-gray-400 hover:text-white flex items-center justify-center gap-1 text-sm py-2 bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors">
                       {isExpanded ? <><ChevronUpIcon/> Less</> : <><ChevronDownIcon/> Details</>}
                    </button>
                </div>
            </div>
        </div>
    );
};
