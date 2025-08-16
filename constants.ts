import type { StrategyConfig } from './types';

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
    trading_pairs: ["ETH/USDT", "BTC/USDT", "SOL/USDT"],
    total_capital_usd: 1000.0,
    max_concurrent_trades: 3,
    
    // New high-level risk controls
    base_kelly_fraction: 0.5, // Safety multiplier for all bets
    max_bet_pct: 0.02,        // Max 2% of capital per trade
    
    // Bot's internal learning parameters
    fractional_kelly: 0.25,   // Additional shrinkage to be conservative
    min_samples_for_bucket: 20, // Min trades before trusting empirical win rate
    ewma_alpha: 0.05,         // Learning rate for win rate estimates
};


export const BOT_TIMEFRAMES = [1, 3, 5, 15, 30, 60, 120];

export const COMMON_TRADING_PAIRS = [
    "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "LINK/USDT",
    "DOT/USDT", "MATIC/USDT", "SHIB/USDT", "LTC/USDT", "TRX/USDT", "UNI/USDT", "ATOM/USDT", "ETC/USDT", "BCH/USDT",
    "NEAR/USDT", "XLM/USDT", "ALGO/USDT", "VET/USDT", "FIL/USDT", "ICP/USDT", "HBAR/USDT", "FTM/USDT", "MANA/USDT",
    "SAND/USDT", "THETA/USDT", "AAVE/USDT", "EOS/USDT", "XTZ/USDT", "EGLD/USDT", "AXS/USDT",
    "BTC/BUSD", "ETH/BUSD", "SOL/BUSD", "BNB/BUSD",
    "ETH/BTC", "SOL/BTC", "BNB/BTC", "ADA/BTC", "XRP/BTC",
];


export const BOT_STRATEGY_SCRIPT = `
/*
 * Adaptive Kelly Multi-Timeframe Bot v1.0 (JS Implementation)
 * - Ingests historical candle data.
 * - Computes multi-timeframe signals (1m, 3m, 5m, 15m, 30m, 1h, 2h).
 * - Maintains empirical win-rate/pay-off estimates for each timeframe's signals.
 * - Produces per-TF probabilities, an aggregate ensemble confidence, and a constrained fractional Kelly bet.
 * - This script is self-contained and does not rely on external TA libraries.
 */

class AdaptiveKellyBot {
    constructor(config) {
        this.config = config;
        this.tf_list = [1, 3, 5, 15, 30, 60, 120];
        
        // --- Bot State ---
        this.capital = config.total_capital_usd;
        this.tf_signals = {};
        this.empirical_buckets = {};

        for (const tf of this.tf_list) {
            this.tf_signals[tf] = { timeframe_min: tf, probability: 0.5, score: 0.0, last_signal: 'hold', samples: 0 };
            this.empirical_buckets[tf] = {
                wins: 0, losses: 0, total_win_amount: 0, total_loss_amount: 0,
                ewma_p: 0.5, ewma_r: 1.0, alpha: config.ewma_alpha || 0.05
            };
        }
    }

    // --- TA Functions ---
    ema(values, period) {
        if (values.length < period) return Array(values.length).fill(NaN);
        const multiplier = 2 / (period + 1);
        const ema = [values.slice(0, period).reduce((a, b) => a + b, 0) / period];
        for (let i = period; i < values.length; i++) {
            ema.push((values[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
        }
        // Prepend NaNs to match original length for easy alignment
        return Array(values.length - ema.length).fill(NaN).concat(ema);
    }
    
    rsi(values, period = 14) {
        if (values.length <= period) return Array(values.length).fill(NaN);
        const rsi = Array(values.length).fill(NaN);
        const deltas = values.slice(1).map((v, i) => v - values[i]);
        let avgGain = deltas.slice(0, period).filter(d => d > 0).reduce((a, b) => a + b, 0) / period;
        let avgLoss = -deltas.slice(0, period).filter(d => d < 0).reduce((a, b) => a + b, 0) / period;
        
        for (let i = period; i < values.length - 1; i++) {
            if (i > period) {
                const change = deltas[i - 1];
                avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
                avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
            }
            const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
            rsi[i + 1] = 100 - 100 / (1 + rs);
        }
        return rsi;
    }

    macd(values, f = 12, s = 26, sig = 9) {
        const emaF = this.ema(values, f);
        const emaS = this.ema(values, s);
        const macdLine = emaF.map((v, i) => v - emaS[i]);
        const signalLine = this.ema(macdLine.filter(v => !isNaN(v)), sig);
        const alignedSignal = Array(macdLine.length - signalLine.length).fill(NaN).concat(signalLine);
        const hist = macdLine.map((v, i) => v - alignedSignal[i]);
        return { macdLine, signalLine: alignedSignal, hist };
    }

    atr(candles, period = 14) {
        if (candles.length < period) return Array(candles.length).fill(NaN);
        const trs = [NaN];
        for (let i = 1; i < candles.length; i++) {
            const c = candles[i], pc = candles[i-1];
            trs.push(Math.max(c.high - c.low, Math.abs(c.high - pc.close), Math.abs(c.low - pc.close)));
        }
        const atr = Array(trs.length).fill(NaN);
        let sum = trs.slice(1, period + 1).reduce((a, b) => a + b, 0);
        atr[period] = sum / period;
        for (let i = period + 1; i < trs.length; i++) {
            atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period;
        }
        return atr;
    }
    
    aggregateCandles(candles, intervalMinutes) {
        if (!candles || candles.length === 0) return [];
        const intervalMs = intervalMinutes * 60 * 1000;
        const sorted = [...candles].sort((a, b) => a.id - b.id);
        const aggregated = new Map();
        for (const c of sorted) {
            const timestamp = Math.floor(c.id / intervalMs) * intervalMs;
            if (!aggregated.has(timestamp)) {
                aggregated.set(timestamp, { id: timestamp, timestamp: new Date(timestamp), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
            } else {
                const existing = aggregated.get(timestamp);
                existing.high = Math.max(existing.high, c.high);
                existing.low = Math.min(existing.low, c.low);
                existing.close = c.close;
                existing.volume += c.volume;
            }
        }
        return Array.from(aggregated.values());
    }

    // --- Core Logic ---
    computeTfSignal(candles, tf) {
        const agg = this.aggregateCandles(candles, tf);
        if (agg.length < 50) return { ...this.tf_signals[tf], samples: 0 };
        
        const closes = agg.map(c => c.close);
        const emaFast = this.ema(closes, 50).pop();
        const emaSlow = this.ema(closes, agg.length >= 200 ? 200 : 100).pop();
        const rsiVal = this.rsi(closes, 14).pop();
        const { macdLine, signalLine } = this.macd(closes);
        const macdVal = macdLine.pop() - signalLine.pop();
        const atrVal = this.atr(agg, 14).pop();
        const price = closes.pop();
        const atrPct = atrVal / price;

        const trend = Math.tanh((emaFast - emaSlow) / price * 100);
        const mom = Math.tanh((rsiVal - 50) / 25);
        const macdScore = Math.tanh(macdVal / price * 100);
        
        let score = 0.5 * trend + 0.35 * mom + 0.15 * macdScore;
        score *= (1 - Math.exp(-atrPct * 1000)); // Volatility gate

        const signal = score > 0.08 ? 'bull' : score < -0.08 ? 'bear' : 'hold';
        
        const bucket = this.empirical_buckets[tf];
        const rawP = 0.5 + 0.4 * Math.tanh(score * 5);
        const combinedP = 0.6 * bucket.ewma_p + 0.4 * rawP;
        const samples = Math.floor(bucket.wins + bucket.losses);

        return { timeframe_min: tf, probability: combinedP, score, last_signal: signal, samples };
    }
    
    produceTfMap(candles) {
        for (const tf of this.tf_list) {
            this.tf_signals[tf] = this.computeTfSignal(candles, tf);
        }
        return this.tf_signals;
    }
    
    aggregateConfidence() {
        const weights = {};
        let totalW = 0;
        this.tf_list.forEach(tf => {
            const w = 1.0 / (Math.log(tf + 1) + 0.01);
            weights[tf] = w;
            totalW += w;
        });
        Object.keys(weights).forEach(tf => weights[tf] /= totalW);
        
        let votes = 0;
        this.tf_list.forEach(tf => {
            const s = this.tf_signals[tf];
            if (s.last_signal === 'bull') votes += weights[tf] * s.probability;
            else if (s.last_signal === 'bear') votes -= weights[tf] * (1 - s.probability);
        });
        
        const aggP = Math.max(0.01, Math.min(0.99, 0.5 + votes));
        const strength = this.tf_list.reduce((sum, tf) => sum + Math.abs(this.tf_signals[tf].score) * weights[tf], 0);
        
        return { agg_p: aggP, strength };
    }
    
    computeBet(aggP, tfChoice, assumedR = 2.0) {
        const p = aggP;
        const R = this.empirical_buckets[tfChoice].ewma_r || assumedR;
        const rawK = p - (1 - p) / R;
        if (rawK <= 0) return 0;
        
        const bucket = this.empirical_buckets[tfChoice];
        const sampleN = bucket.wins + bucket.losses;
        const sampleShrink = Math.min(1.0, sampleN / this.config.min_samples_for_bucket);
        
        const kShrunk = rawK * this.config.fractional_kelly * this.config.base_kelly_fraction * sampleShrink;
        
        const bet = kShrunk * this.capital;
        const betCap = this.config.max_bet_pct * this.capital;
        
        return Math.max(0, Math.min(bet, betCap));
    }
}`;
