import type { PriceHistoryLogEntry, StrategyConfig, Signal, TimeframeAnalysis, MarketRegime, Trade } from '../types';
import { calculateEMA, calculateRSI, calculateMACD, calculateATR } from './ta';
import { BOT_TIMEFRAMES } from '../constants';

// --- TYPE DEFINITIONS ---
interface TFSignal {
    timeframe_min: number;
    probability: number;
    score: number;
    last_signal: 'bull' | 'bear' | 'hold';
    samples: number;
}

class EmpiricalBucket {
    wins: number = 0;
    losses: number = 0;
    total_win_amount: number = 0;
    total_loss_amount: number = 0;
    ewma_p: number = 0.5;
    ewma_r: number = 1.0;
    alpha: number;

    constructor(alpha: number) {
        this.alpha = alpha;
    }

    update(outcome_return: number) {
        let win_rate = this.wins / (this.wins + this.losses) || 0.5;
        let avg_win = this.total_win_amount / this.wins || 0.0;
        let avg_loss = this.total_loss_amount / this.losses || 0.0;
        
        if (outcome_return > 0) {
            this.wins++;
            this.total_win_amount += outcome_return;
            win_rate = this.wins / (this.wins + this.losses);
            avg_win = this.total_win_amount / this.wins;
        } else {
            this.losses++;
            this.total_loss_amount += -outcome_return;
            win_rate = this.wins / (this.wins + this.losses);
            avg_loss = this.total_loss_amount / this.losses;
        }
        
        const R = avg_loss > 0 ? avg_win / avg_loss : 1.0;
        this.ewma_p = (1 - this.alpha) * this.ewma_p + this.alpha * win_rate;
        this.ewma_r = (1 - this.alpha) * this.ewma_r + this.alpha * R;
    }
}

export class AdaptiveKellyBot {
    config: StrategyConfig;
    capital: number;
    tf_signals: Record<number, TFSignal> = {};
    empirical_buckets: Record<number, EmpiricalBucket> = {};

    constructor(config: StrategyConfig) {
        this.config = config;
        this.capital = config.total_capital_usd;

        for (const tf of BOT_TIMEFRAMES) {
            this.tf_signals[tf] = { timeframe_min: tf, probability: 0.5, score: 0.0, last_signal: 'hold', samples: 0 };
            this.empirical_buckets[tf] = new EmpiricalBucket(config.ewma_alpha);
        }
    }

    // --- UTILITIES ---
    private aggregateCandles(candles: PriceHistoryLogEntry[], intervalMinutes: number): PriceHistoryLogEntry[] {
        if (!candles || candles.length === 0) return [];
        const intervalMs = intervalMinutes * 60 * 1000;
        const sorted = [...candles].sort((a, b) => a.id - b.id);
        const aggregated = new Map<number, PriceHistoryLogEntry>();
        for (const c of sorted) {
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
        }
        return Array.from(aggregated.values());
    }

    // --- CORE LOGIC ---
    computeTfSignal(candles: PriceHistoryLogEntry[], tf: number): TFSignal {
        const agg = this.aggregateCandles(candles, tf);
        if (agg.length < 50) return { timeframe_min: tf, probability: 0.5, score: 0.0, last_signal: 'hold', samples: 0 };
        
        const closes = agg.map(c => c.close);
        const emaFast = calculateEMA(closes, 50).pop()!;
        const emaSlow = calculateEMA(closes, agg.length >= 200 ? 200 : 100).pop()!;
        const rsiVal = calculateRSI(closes, 14).pop()!;
        const { MACD, signal: signalLine } = calculateMACD(closes);
        const macdVal = MACD.pop()! - signalLine.pop()!;
        const atrVal = calculateATR(agg, 14).pop()!;
        const price = closes[closes.length - 1];
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
    
    produceTfMap(candles: PriceHistoryLogEntry[]): Record<number, TFSignal> {
        for (const tf of BOT_TIMEFRAMES) {
            this.tf_signals[tf] = this.computeTfSignal(candles, tf);
        }
        return this.tf_signals;
    }
    
    aggregateConfidence(): { agg_p: number, strength: number } {
        const weights: Record<number, number> = {};
        let totalW = 0;
        BOT_TIMEFRAMES.forEach(tf => {
            const w = 1.0 / (Math.log(tf + 1) + 0.01);
            weights[tf] = w;
            totalW += w;
        });
        Object.keys(weights).forEach(tf_key => {
            const tf = Number(tf_key);
            weights[tf] /= totalW;
        });
        
        let votes = 0;
        BOT_TIMEFRAMES.forEach(tf => {
            const s = this.tf_signals[tf];
            if (s.last_signal === 'bull') votes += weights[tf] * s.probability;
            else if (s.last_signal === 'bear') votes -= weights[tf] * (1 - s.probability);
        });
        
        const aggP = Math.max(0.01, Math.min(0.99, 0.5 + votes));
        const strength = BOT_TIMEFRAMES.reduce((sum, tf) => sum + Math.abs(this.tf_signals[tf].score) * weights[tf], 0);
        
        return { agg_p: aggP, strength };
    }
    
    computeBet(aggP: number, tfChoice: number, assumedR: number = 2.0): number {
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
    
     runSingleAnalysis(pair: string, history: PriceHistoryLogEntry[]): Signal | null {
        if (history.length < 200) return null;

        const tfMap = this.produceTfMap(history);
        const { agg_p, strength } = this.aggregateConfidence();

        const short_tfs = BOT_TIMEFRAMES.filter(tf => tf <= 30);
        const chosen_tf = short_tfs.reduce((maxTf, tf) => 
            Math.abs(tfMap[tf].score) > Math.abs(tfMap[maxTf].score) ? tf : maxTf
        , short_tfs[0]);
        
        const chosen_signal = tfMap[chosen_tf].last_signal;

        let action: 'buy' | 'sell' | 'hold' = 'hold';
        let note = "Ensemble signals are mixed or weak.";

        if ((agg_p > 0.52 && chosen_signal === 'bull') || (agg_p < 0.48 && chosen_signal === 'bear')) {
             action = chosen_signal === 'bull' ? 'buy' : 'sell';
             note = `Ensemble aligns with ${chosen_tf}m signal.`;
        }

        const betSizeUSD = action !== 'hold' ? this.computeBet(agg_p, chosen_tf) : 0;
        if(betSizeUSD < 1) action = 'hold';
        
        const currentPrice = history[history.length - 1].close;
        const stopLossPct = 0.015; // 1.5%
        const takeProfitPct = 0.03; // 3%

        const meta: TimeframeAnalysis[] = Object.values(tfMap).map(
            (tf: TFSignal): TimeframeAnalysis => ({
                timeframe: `${tf.timeframe_min}m`,
                confidence: tf.probability,
                signal: tf.last_signal,
                score: tf.score,
                samples: tf.samples,
            })
        );

        return {
            pair,
            action,
            confidence: agg_p,
            strength,
            betSizeUSD,
            last_price: currentPrice,
            take_profit: action === 'buy' ? currentPrice * (1 + takeProfitPct) : currentPrice * (1 - takeProfitPct),
            stop_loss: action === 'buy' ? currentPrice * (1 - stopLossPct) : currentPrice * (1 + stopLossPct),
            meta: meta,
            note
        };
    }
}

export const runBotAnalysis = (
    pair: string,
    history: PriceHistoryLogEntry[],
    config: StrategyConfig,
    livePrice: PriceHistoryLogEntry | null,
): Signal | null => {
    const bot = new AdaptiveKellyBot(config);
    let analysisHistory = [...history]; // Make a copy
    // If livePrice is provided and is newer than the last history entry, add it.
    if (livePrice && (!analysisHistory.length || livePrice.id > analysisHistory[analysisHistory.length - 1].id)) {
        analysisHistory.push(livePrice);
    }
    return bot.runSingleAnalysis(pair, analysisHistory);
};
