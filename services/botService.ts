import type { PriceHistoryLogEntry, HeatScores } from '../types';
import { calculateEMA, calculateBollingerBands, calculateRSI } from './ta';

// --- BOT CONFIGURATION ('Leviathan Apex' Profile) ---
const TraderSettings = {
    SYMBOL: 'BTCUSDT',
    MACRO_TREND_TF: "60T",
    EXECUTION_TF: "5T",
    MACRO_EMA_PERIOD: 50,
    BBANDS_PERIOD: 20,
    BBANDS_STD_DEV: 2.0,
    ATR_PERIOD: 14,
    ATR_VOLATILITY_THRESHOLD: 0.0008,
    NUM_TRADES_PER_DAY: 4,
    TOTAL_DAILY_CAPITAL: 1000.00,
    TRADE_RISK_PERCENT: 0.05,
    MAX_1S_BUFFER_SIZE: 7200, // 2 hours of 1-second data
};

interface PreparedData {
    macro: {
        candles: PriceHistoryLogEntry[];
        ema: (number | null)[];
    };
}

export class BtcUsdTrader {
    private settings = TraderSettings;
    private dataBuffer1s: PriceHistoryLogEntry[] = [];
    private tradesExecutedToday: number = 0;
    private lastResetDay: number = -1;
    private lastProcessed1mTimestamp: number = 0;

    constructor(apiKey?: string, apiSecret?: string) {
        // In a real live bot, the API client would be initialized here
    }

    public getDailyTradeCount = () => this.tradesExecutedToday;
    public getDailyTradeLimit = () => this.settings.NUM_TRADES_PER_DAY;
    
    private resample(candles: PriceHistoryLogEntry[], intervalSeconds: number): PriceHistoryLogEntry[] {
        if (!candles || candles.length === 0) return [];
        const intervalMs = intervalSeconds * 1000;
        const aggregated = new Map<number, PriceHistoryLogEntry[]>();

        candles.forEach(c => {
            const timestamp = Math.floor(c.id / intervalMs) * intervalMs;
            if (!aggregated.has(timestamp)) aggregated.set(timestamp, []);
            aggregated.get(timestamp)!.push(c);
        });

        const resampled: PriceHistoryLogEntry[] = [];
        aggregated.forEach((group, timestamp) => {
            const intervalMinutes = intervalSeconds / 60;
            resampled.push({
                id: timestamp,
                timestamp: new Date(timestamp),
                pair: group[0].pair,
                open: group[0].open,
                high: Math.max(...group.map(c => c.high)),
                low: Math.min(...group.map(c => c.low)),
                close: group[group.length - 1].close,
                volume: group.reduce((sum, c) => sum + c.volume, 0),
                interval: intervalMinutes > 1 ? `${intervalMinutes}m` as any : '1m',
            });
        });

        return resampled.sort((a, b) => a.id - b.id);
    }
    
    public initializeBuffer(candles1s: PriceHistoryLogEntry[]): void {
        this.dataBuffer1s = candles1s.sort((a, b) => a.id - b.id);
        if (this.dataBuffer1s.length > this.settings.MAX_1S_BUFFER_SIZE) {
            this.dataBuffer1s = this.dataBuffer1s.slice(-this.settings.MAX_1S_BUFFER_SIZE);
        }
        this.lastResetDay = new Date().getUTCDate();
        if (this.dataBuffer1s.length > 0) {
            const lastCandle = this.dataBuffer1s[this.dataBuffer1s.length-1];
            this.lastProcessed1mTimestamp = Math.floor(lastCandle.id / 60000) * 60000;
        }
    }

    public updateWithNewCandles(newCandles: PriceHistoryLogEntry[]): void {
        if (newCandles && newCandles.length > 0) {
            const existingIds = new Set(this.dataBuffer1s.map(c => c.id));
            const uniqueNewKlines = newCandles.filter(k => !existingIds.has(k.id));
            
            this.dataBuffer1s = [...this.dataBuffer1s, ...uniqueNewKlines].sort((a, b) => a.id - b.id);

            if (this.dataBuffer1s.length > this.settings.MAX_1S_BUFFER_SIZE) {
                this.dataBuffer1s = this.dataBuffer1s.slice(-this.settings.MAX_1S_BUFFER_SIZE);
            }
        }
    }

    public runAnalysis(): { heatScores: HeatScores, newOneMinuteCandles: PriceHistoryLogEntry[] } {
        const candles1m = this.resample(this.dataBuffer1s, 60);
        candles1m.forEach(c => c.interval = '1m');

        const newOneMinuteCandles = candles1m.filter(c => c.id > this.lastProcessed1mTimestamp);
        
        const completeNewCandles = newOneMinuteCandles.slice(0, -1);
        if(completeNewCandles.length > 0){
            this.lastProcessed1mTimestamp = completeNewCandles[completeNewCandles.length - 1].id;
        }

        const macro_df = this.resample(candles1m, 3600); // 60 minutes
        macro_df.forEach(c => c.interval = '60m' as any);
        
        const macro_ema = calculateEMA(macro_df.map(c => c.close), this.settings.MACRO_EMA_PERIOD);
        
        const pad = (arr: (number|null)[], targetLength: number) => [...new Array(targetLength - arr.length).fill(null), ...arr];

        const preparedData: PreparedData = {
            macro: {
                candles: macro_df,
                ema: pad(macro_ema, macro_df.length)
            }
        };

        const heatScores = this.calculateHeat(preparedData, candles1m);

        return { heatScores, newOneMinuteCandles: completeNewCandles };
    }
    
    public calculateHeat(preparedData: PreparedData, candles1m: PriceHistoryLogEntry[]): HeatScores {
        const { macro } = preparedData;
        const emptyScores: HeatScores = { '15m': { buy: 0, sell: 0 }, '30m': { buy: 0, sell: 0 } };
        
        if (candles1m.length < 21) return emptyScores;

        const data15m = this.resample(candles1m, 900); // 15 minutes
        if (data15m.length < 21) return emptyScores;

        const closes15m = data15m.map(c => c.close);
        const lastClose15m = closes15m[closes15m.length - 1];

        const ema21_15m = calculateEMA(closes15m, 21);
        const rsi14_15m = calculateRSI(closes15m, 14);
        const { bbw } = calculateBollingerBands(closes15m, 20, 2);
        
        const lastEma15m = ema21_15m[ema21_15m.length - 1];
        const lastRsi15m = rsi14_15m[rsi14_15m.length - 1];
        const lastBbw15m = bbw[bbw.length - 1];
        
        let buyHeat15 = 0;
        let sellHeat15 = 0;

        if (lastEma15m && lastRsi15m && lastBbw15m) {
            if (lastClose15m > lastEma15m) buyHeat15 += 20 + 15 * Math.min(1, (lastClose15m - lastEma15m) / lastEma15m * 200);
            else sellHeat15 += 20 + 15 * Math.min(1, (lastEma15m - lastClose15m) / lastEma15m * 200);

            if (lastRsi15m < 35) buyHeat15 += 40 * ((35 - lastRsi15m) / 20);
            if (lastRsi15m > 65) sellHeat15 += 40 * ((lastRsi15m - 65) / 20);

            const bbwHistory = bbw.slice(-20);
            const bbwAvg = bbwHistory.reduce((a, b) => a + b, 0) / bbwHistory.length;
            if (lastBbw15m < bbwAvg * 0.75) {
                const squeezeFactor = Math.max(0, 1 - (lastBbw15m / (bbwAvg * 0.75)));
                buyHeat15 += 25 * squeezeFactor;
                sellHeat15 += 25 * squeezeFactor;
            }
        }

        const { candles: macroCandles, ema: macroEma } = macro;
        if (macroCandles.length < 21 || !macroEma[macroEma.length - 1]) {
            return { ...emptyScores, '15m': { buy: Math.min(100, Math.round(buyHeat15)), sell: Math.min(100, Math.round(sellHeat15)) }};
        }
        
        const closes60m = macroCandles.map(c => c.close);
        const lastClose60m = closes60m[closes60m.length - 1];
        const rsi14_60m = calculateRSI(closes60m, 14);
        const { bbw: bbw60m } = calculateBollingerBands(closes60m, 20, 2);

        const lastEma60m = macroEma[macroEma.length - 1];
        const lastRsi60m = rsi14_60m[rsi14_60m.length - 1];
        const lastBbw60m = bbw60m[bbw60m.length - 1];

        let buyHeat30 = 0;
        let sellHeat30 = 0;

        if (lastEma60m && lastRsi60m && lastBbw60m) {
            if (lastClose60m > lastEma60m) buyHeat30 += 35; else sellHeat30 += 35;
            if (lastRsi60m < 40) buyHeat30 += 40 * ((40 - lastRsi60m) / 20);
            if (lastRsi60m > 60) sellHeat30 += 40 * ((lastRsi60m - 60) / 20);
            const bbwHistory = bbw60m.slice(-20);
            const bbwAvg = bbwHistory.reduce((a, b) => a + b, 0) / bbwHistory.length;
            if (lastBbw60m < bbwAvg * 0.8) {
                const squeezeFactor = Math.max(0, 1 - (lastBbw60m / (bbwAvg * 0.8)));
                buyHeat30 += 25 * squeezeFactor;
                sellHeat30 += 25 * squeezeFactor;
            }
        }
        
        return {
            '15m': { buy: Math.min(100, Math.round(buyHeat15)), sell: Math.min(100, Math.round(sellHeat15)) },
            '30m': { buy: Math.min(100, Math.round(buyHeat30)), sell: Math.min(100, Math.round(sellHeat30)) },
        };
    }

    public recordTradeExecution(): void {
        const currentDay = new Date().getUTCDate();
        if (currentDay !== this.lastResetDay) {
            this.tradesExecutedToday = 0;
            this.lastResetDay = currentDay;
        }
        this.tradesExecutedToday++;
    }
}
