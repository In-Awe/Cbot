
import type { PriceHistoryLogEntry, StrategyConfig, PendingOrder, Trade } from '../types';
import { calculateEMA, calculateBollingerBands } from './ta';

// --- PER-ASSET CALIBRATED PROFILES ---
const AssetProfiles: Record<string, any> = {
    'XRP/USDT': {
        MACRO_EMA_PERIOD: 35,
        BBW_SQUEEZE_THRESHOLD: 0.015,
        TRADE_RISK_PERCENT: 0.03,
    },
    'SOL/USDT': {
        MACRO_EMA_PERIOD: 50,
        BBW_SQUEEZE_THRESHOLD: 0.008,
        TRADE_RISK_PERCENT: 0.05,
    },
    'BNB/USDT': {
        MACRO_EMA_PERIOD: 50,
        BBW_SQUEEZE_THRESHOLD: 0.011,
        TRADE_RISK_PERCENT: 0.05,
    },
    // Default profile
    'DEFAULT': {
        MACRO_EMA_PERIOD: 50,
        BBW_SQUEEZE_THRESHOLD: 0.010,
        TRADE_RISK_PERCENT: 0.04,
    }
};

interface IndicatorData {
    candles: PriceHistoryLogEntry[];
    ema?: number[];
    bbands?: { middle: number[], upper: number[], lower: number[], bbw: number[] };
}

export class LeviathanBot {
    settings: any;
    private indicatorData: Record<string, IndicatorData> = {};

    constructor(symbol: string, globalConfig: StrategyConfig) {
        const profile = AssetProfiles[symbol] || AssetProfiles['DEFAULT'];
        this.settings = {
            ...globalConfig,
            ...profile,
            MACRO_TREND_TF: "30T",
            EXECUTION_TF: "5T",
        };
    }

    private resample(candles: PriceHistoryLogEntry[], intervalMinutes: number): PriceHistoryLogEntry[] {
        if (!candles || candles.length === 0) return [];
        const intervalMs = intervalMinutes * 60 * 1000;
        const aggregated = new Map<number, PriceHistoryLogEntry>();
        candles.forEach(c => {
            const timestamp = Math.floor(c.id / intervalMs) * intervalMs;
            if (!aggregated.has(timestamp)) {
                aggregated.set(timestamp, { ...c, id: timestamp, timestamp: new Date(timestamp) });
            } else {
                const existing = aggregated.get(timestamp)!;
                existing.high = Math.max(existing.high, c.high);
                existing.low = Math.min(existing.low, c.low);
                existing.close = c.close;
                existing.volume += c.volume;
            }
        });
        return Array.from(aggregated.values()).sort((a,b)=>a.id - b.id);
    }

    public prepareData(candles1m: PriceHistoryLogEntry[]): void {
        const macro_df = this.resample(candles1m, 30);
        if (macro_df.length > this.settings.MACRO_EMA_PERIOD) {
            this.indicatorData[this.settings.MACRO_TREND_TF] = {
                candles: macro_df,
                ema: calculateEMA(macro_df.map(c => c.close), this.settings.MACRO_EMA_PERIOD),
            };
        }

        const exec_df = this.resample(candles1m, 5);
        if (exec_df.length > this.settings.bband_period) {
            this.indicatorData[this.settings.EXECUTION_TF] = {
                candles: exec_df,
                bbands: calculateBollingerBands(exec_df.map(c => c.close), this.settings.bband_period, this.settings.bband_std_dev),
            };
        }
    }
    
    private findLastIndex(candles: PriceHistoryLogEntry[], timestamp: number): number {
        if (!candles) return -1;
        // This is a simple version of pandas.asof
        let last_idx = -1;
        for (let i = candles.length - 1; i >= 0; i--) {
            if (candles[i].id <= timestamp) {
                last_idx = i;
                break;
            }
        }
        return last_idx;
    }

    public checkForSetup(timestamp: number): (PendingOrder & { note: string }) | { note: string } {
        const macro_tf_data = this.indicatorData[this.settings.MACRO_TREND_TF];
        const exec_tf_data = this.indicatorData[this.settings.EXECUTION_TF];

        if (!macro_tf_data?.ema || !exec_tf_data?.bbands?.bbw) return { note: "Indicator data not ready." };
        
        const macro_idx = this.findLastIndex(macro_tf_data.candles, timestamp);
        if (macro_idx < 0 || macro_idx >= macro_tf_data.ema.length) return { note: `Macro data out of bounds for timestamp ${timestamp}.` };
        
        const macro_latest_candle = macro_tf_data.candles[macro_idx];
        const macro_latest_ema = macro_tf_data.ema[macro_idx];
        const macro_trend = macro_latest_candle.close > macro_latest_ema ? 'UP' : 'DOWN';

        const exec_idx = this.findLastIndex(exec_tf_data.candles, timestamp);
        const bband_idx = exec_idx - (exec_tf_data.candles.length - exec_tf_data.bbands.bbw.length);
        if (bband_idx < 0 || bband_idx >= exec_tf_data.bbands.bbw.length) return { note: `Exec data out of bounds for timestamp ${timestamp}. Trend: ${macro_trend}.` };

        const latest_bbw = exec_tf_data.bbands.bbw[bband_idx];

        if (latest_bbw < this.settings.BBW_SQUEEZE_THRESHOLD) {
            const exec_candles = exec_tf_data.candles;
            const consolidation_slice = exec_candles.slice(Math.max(0, exec_idx - 10), exec_idx + 1);
            if(consolidation_slice.length < 2) return { note: "Not enough candles for consolidation range."};
            
            const consolidation_high = Math.max(...consolidation_slice.map(c => c.high));
            const consolidation_low = Math.min(...consolidation_slice.map(c => c.low));
            
            if (macro_trend === 'UP') {
                return { pair: this.settings.trading_pairs[0], direction: 'BUY', entryPrice: consolidation_high, stopLoss: consolidation_low, note: `Squeeze detected. Trend UP. Pending BUY at ${consolidation_high.toFixed(4)}` };
            } else {
                return { pair: this.settings.trading_pairs[0], direction: 'SELL', entryPrice: consolidation_low, stopLoss: consolidation_high, note: `Squeeze detected. Trend DOWN. Pending SELL at ${consolidation_low.toFixed(4)}` };
            }
        }
        return { note: `Trend: ${macro_trend}. BBW (${latest_bbw.toFixed(4)}) > Threshold (${this.settings.BBW_SQUEEZE_THRESHOLD}).`};
    }

    public calculateInitialSize(entryPrice: number, stopLoss: number, balance: number): number {
        const risk_per_unit = Math.abs(entryPrice - stopLoss);
        if (risk_per_unit < 1e-9) return 0;
        const risk_amount = balance * this.settings.TRADE_RISK_PERCENT;
        return risk_amount / risk_per_unit;
    }

    public managePosition(trade: Trade, currentPrice: number): { updatedTrade?: Partial<Trade>, pnl?: number, reason?: string, closedUnits?: number } {
        const initial_risk = Math.abs(trade.entryPrice - trade.initialStopLoss);
        
        // TP1 Logic
        if (!trade.tp1Hit) {
            const tp1_price = trade.direction === 'LONG' ? trade.entryPrice + initial_risk : trade.entryPrice - initial_risk;
            if ((trade.direction === 'LONG' && currentPrice >= tp1_price) || (trade.direction === 'SHORT' && currentPrice <= tp1_price)) {
                const unitsToClose = trade.sizeUnits / 3;
                const pnl = (tp1_price - trade.entryPrice) * unitsToClose * (trade.direction === 'LONG' ? 1 : -1);
                return {
                    updatedTrade: { tp1Hit: true, stopLoss: trade.entryPrice, sizeUnits: trade.sizeUnits * (2/3) },
                    pnl,
                    closedUnits: unitsToClose,
                    reason: 'TP1 Hit, SL to Breakeven',
                };
            }
        }
        
        // TP2 Logic
        if (trade.tp1Hit && !trade.tp2Hit) {
            const tp2_price = trade.direction === 'LONG' ? trade.entryPrice + 2 * initial_risk : trade.entryPrice - 2 * initial_risk;
            if ((trade.direction === 'LONG' && currentPrice >= tp2_price) || (trade.direction === 'SHORT' && currentPrice <= tp2_price)) {
                const unitsToClose = trade.sizeUnits / 2; // Half of remaining size
                const pnl = (tp2_price - trade.entryPrice) * unitsToClose * (trade.direction === 'LONG' ? 1 : -1);
                return {
                    updatedTrade: { tp2Hit: true, sizeUnits: trade.sizeUnits / 2 },
                    pnl,
                    closedUnits: unitsToClose,
                    reason: 'TP2 Hit, Trailing Stop Activated',
                };
            }
        }

        // Trailing Stop Logic (only after TP2 is hit)
        if (trade.tp2Hit) {
            if (trade.direction === 'LONG') {
                const highWaterMark = Math.max(trade.highWaterMark || currentPrice, currentPrice);
                const newStop = highWaterMark * (1 - this.settings.trailing_stop_percent);
                if (newStop > trade.stopLoss) {
                    return { updatedTrade: { highWaterMark, stopLoss: newStop } };
                }
            } else { // SHORT
                const lowWaterMark = Math.min(trade.lowWaterMark || currentPrice, currentPrice);
                const newStop = lowWaterMark * (1 + this.settings.trailing_stop_percent);
                if (newStop < trade.stopLoss) {
                    return { updatedTrade: { lowWaterMark, stopLoss: newStop } };
                }
            }
        }
        
        // Stop Loss Check
        if ((trade.direction === 'LONG' && currentPrice <= trade.stopLoss) || (trade.direction === 'SHORT' && currentPrice >= trade.stopLoss)) {
            const pnl = (trade.stopLoss - trade.entryPrice) * trade.sizeUnits * (trade.direction === 'LONG' ? 1 : -1);
            const reason = trade.tp1Hit ? 'Stop Loss' : 'Initial Stop';
            return {
                updatedTrade: { status: 'closed', exitPrice: trade.stopLoss, closedAt: new Date() },
                pnl,
                closedUnits: trade.sizeUnits,
                reason: reason
            };
        }
        
        return {}; // No action
    }
}
