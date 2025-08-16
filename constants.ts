
import type { StrategyConfig } from './types';

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
    trading_pairs: ["XRP/USDT", "SOL/USDT", "BNB/USDT"],
    total_capital_usd: 1000.0,
    max_concurrent_trades: 3,
    
    // Global Settings ('Leviathan' Engine)
    bband_period: 20,
    bband_std_dev: 2.0,
    trailing_stop_percent: 0.02, // 2%

    // Simulation Realism
    fee_pct: 0.00075,
    slippage_pct_perc: 0.0005,

    // Backtest Safety
    max_drawdown_pct: 0.2,
};


export const AVAILABLE_TIMEFRAMES = [1, 3, 5, 15, 30, 60, 120];

export const COMMON_TRADING_PAIRS = [
    "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "LINK/USDT",
    "DOT/USDT", "MATIC/USDT", "SHIB/USDT", "LTC/USDT", "TRX/USDT", "UNI/USDT", "ATOM/USDT", "ETC/USDT", "BCH/USDT",
    "NEAR/USDT", "XLM/USDT", "ALGO/USDT", "VET/USDT", "FIL/USDT", "ICP/USDT", "HBAR/USDT", "FTM/USDT", "MANA/USDT",
    "SAND/USDT", "THETA/USDT", "AAVE/USDT", "EOS/USDT", "XTZ/USDT", "EGLD/USDT", "AXS/USDT",
];


export const BOT_STRATEGY_SCRIPT = `
/*
 * Gemini Bot ('The Leviathan' - Multi-Profile)
 * This bot uses calibrated, per-asset profiles to trade volatility breakouts.
 * It identifies a macro trend on a higher timeframe (30m) and waits for a
 * period of low volatility (a "squeeze") on a lower timeframe (5m), measured
 * by Bollinger Band Width. It then places pending breakout orders.
 *
 * Key Features:
 * - Calibrated Profiles: Uses hard-coded, optimized settings for specific
 *   pairs like XRP, SOL, and BNB for EMA, BBW thresholds, and risk.
 * - Squeeze Detection: Enters only when Bollinger Bands narrow below a
 *   calibrated threshold, indicating a potential explosive move.
 * - Pending Orders: Sets buy-stop/sell-stop orders above/below the consolidation
 *   range, ensuring entry only on confirmed momentum.
 * - Risk-Based Sizing: Position size is calculated to risk a fixed percentage
 *   of the portfolio on each trade, defined by the asset's profile.
 * - Multi-Stage Exits:
 *   - TP1 (1/3 size) at 1:1 Risk/Reward, then moves stop to breakeven.
 *   - TP2 (1/2 of remainder) at 2:1 Risk/Reward.
 *   - Final 1/3 is managed with a trailing stop loss to maximize profit.
 */

// --- PER-ASSET CALIBRATED PROFILES ---
const AssetProfiles = {
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
    }
};

class LeviathanBot {
    constructor(symbol, globalConfig) {
        const profile = AssetProfiles[symbol] || AssetProfiles['SOL/USDT'];
        this.settings = {
            ...globalConfig,
            ...profile,
            MACRO_TREND_TF: "30T",
            EXECUTION_TF: "5T",
        };
        this.portfolio = { balance: globalConfig.total_capital_usd };
    }

    // --- Data Preparation & TA ---
    // (Assuming external implementations of aggregateCandles, ema, bollingerBands)
    prepareData(candles1m, ta) {
        const data = {};
        
        const macro_df = this._resample(candles1m, 30);
        const macro_closes = macro_df.map(c => c.close);
        data[this.settings.MACRO_TREND_TF] = {
            candles: macro_df,
            ema: ta.calculateEMA(macro_closes, this.settings.MACRO_EMA_PERIOD),
        };

        const exec_df = this._resample(candles1m, 5);
        const exec_closes = exec_df.map(c => c.close);
        data[this.settings.EXECUTION_TF] = {
            candles: exec_df,
            bbands: ta.calculateBollingerBands(exec_closes, this.settings.bband_period, this.settings.bband_std_dev),
        };
        return data;
    }
    
    // Simplified resample/aggregation helper
    _resample(candles, intervalMinutes) {
        if (!candles || candles.length === 0) return [];
        const intervalMs = intervalMinutes * 60 * 1000;
        const aggregated = new Map();
        candles.forEach(c => {
            const timestamp = Math.floor(c.id / intervalMs) * intervalMs;
            if (!aggregated.has(timestamp)) {
                aggregated.set(timestamp, { ...c, id: timestamp, timestamp: new Date(timestamp), count: 1 });
            } else {
                const existing = aggregated.get(timestamp);
                existing.high = Math.max(existing.high, c.high);
                existing.low = Math.min(existing.low, c.low);
                existing.close = c.close;
                existing.volume += c.volume;
                existing.count += 1;
            }
        });
        return Array.from(aggregated.values());
    }
    
    // --- Core Strategy Logic ---
    checkForSetup(timestamp, indicatorData) {
        const macro_tf = this.settings.MACRO_TREND_TF;
        const exec_tf = this.settings.EXECUTION_TF;
        
        // Find data points for the current timestamp
        const macro_idx = this._findLastIndex(indicatorData[macro_tf].candles, timestamp);
        const exec_idx = this._findLastIndex(indicatorData[exec_tf].candles, timestamp);
        
        if (macro_idx < 0 || exec_idx < this.settings.bband_period) return null;

        const macro_latest_candle = indicatorData[macro_tf].candles[macro_idx];
        const macro_latest_ema = indicatorData[macro_tf].ema[macro_idx];
        
        const macro_trend = macro_latest_candle.close > macro_latest_ema ? 'UP' : 'DOWN';
        
        const latest_bbw = indicatorData[exec_tf].bbands.bbw[exec_idx];

        if (latest_bbw < this.settings.BBW_SQUEEZE_THRESHOLD) {
            const exec_candles = indicatorData[exec_tf].candles;
            const consolidation_slice = exec_candles.slice(Math.max(0, exec_idx - 10), exec_idx + 1);
            
            const consolidation_high = Math.max(...consolidation_slice.map(c => c.high));
            const consolidation_low = Math.min(...consolidation_slice.map(c => c.low));
            
            if (macro_trend === 'UP') {
                return { direction: 'BUY', entryPrice: consolidation_high, stopLoss: consolidation_low };
            } else {
                return { direction: 'SELL', entryPrice: consolidation_low, stopLoss: consolidation_high };
            }
        }
        return null;
    }

    _findLastIndex(candles, timestamp) {
        // A simple equivalent of pandas' asof or searchsorted
        let last_idx = -1;
        for(let i = 0; i < candles.length; i++) {
            if (candles[i].id <= timestamp) {
                last_idx = i;
            } else {
                break;
            }
        }
        return last_idx;
    }

    // --- Sizing & Position Management ---
    calculateInitialSize(entryPrice, stopLoss, balance) {
        const risk_per_unit = Math.abs(entryPrice - stopLoss);
        if (risk_per_unit < 1e-9) return 0;
        const risk_amount = balance * this.settings.TRADE_RISK_PERCENT;
        return risk_amount / risk_per_unit;
    }

    managePosition(trade, currentPrice) {
        // This logic would be implemented in the main backtesting loop
        // based on the trade's state (tp1Hit, tp2Hit, etc.) and currentPrice.
        // It's too stateful to live purely inside the bot class for the UI.
        return null; // Placeholder
    }
}
`;
