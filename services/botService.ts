import type { PriceHistoryLogEntry, HeatScores } from '../types';
import { calculateSMA, calculateStdDev } from './ta';

// --- BOT CONFIGURATION ('Adaptive Impulse Catcher' for XRP) ---
const TraderSettings = {
    // Trading Pair & Timeframe
    SYMBOL: 'XRPUSDT',
    EXECUTION_TF: "1s",

    // Core Adaptive Impulse Parameters
    BASE_PRICE_CHANGE_THRESHOLD: 0.06, // % (Increased sensitivity)
    VOLUME_SPIKE_FACTOR: 1.8,          // multiplier (Increased sensitivity)
    CONFIDENCE_THRESHOLD: 65,          // min score (Lowered for more frequent triggers)
    
    // Time Windows
    IMPULSE_WINDOW_S: 15,              // seconds
    AVERAGE_VOLUME_WINDOW_S: 60,       // seconds
    VOLATILITY_WINDOW_S: 300,          // 5-minute window for volatility calc

    // Dynamic Behavior Tuning
    VOLATILITY_MULTIPLIER: 2.5,        // Increase sensitivity to volatility

    // Trade Management
    TRADE_EXIT_SECONDS: 60,            // Exit trade after this many seconds if SL isn't hit
    TRAILING_STOP_ACTIVATION_PERCENT: 0.15, // Activate trailing stop after this % profit
    TRAILING_STOP_DISTANCE_PERCENT: 0.10, // Trail the price by this % distance

    // Bot Internals
    NUM_TRADES_PER_DAY: 100,
    MAX_1S_BUFFER_SIZE: 14400,    // 4 hours of 1-second data
};

interface PreparedData {
    candles: PriceHistoryLogEntry[];
    avgVolume: (number | null)[];
}

export class XrpUsdTrader {
    private settings = TraderSettings;
    private dataBuffer1s: PriceHistoryLogEntry[] = [];
    private tradesExecutedToday: number = 0;
    private lastResetDay: number = -1;
    private lastDynamicPriceThreshold: number = 0;

    constructor(apiKey?: string, apiSecret?: string) {
        // API client would be initialized here
    }
    
    public getDailyTradeCount = () => this.tradesExecutedToday;
    public getDailyTradeLimit = () => this.settings.NUM_TRADES_PER_DAY;
    public getConfidenceThreshold = () => this.settings.CONFIDENCE_THRESHOLD;
    public getLastDynamicPriceThreshold = () => this.lastDynamicPriceThreshold;
    public getRecentCandles = (count: number) => this.dataBuffer1s.slice(-count);
    public getTradeExitSeconds = () => this.settings.TRADE_EXIT_SECONDS;
    public getTrailingStopConfig = () => ({
        activation: this.settings.TRAILING_STOP_ACTIVATION_PERCENT,
        distance: this.settings.TRAILING_STOP_DISTANCE_PERCENT,
    });

    public initializeBuffer(candles1s: PriceHistoryLogEntry[]): void {
        this.dataBuffer1s = candles1s.sort((a, b) => a.id - b.id);
        if (this.dataBuffer1s.length > this.settings.MAX_1S_BUFFER_SIZE) {
            this.dataBuffer1s = this.dataBuffer1s.slice(-this.settings.MAX_1S_BUFFER_SIZE);
        }
        this.lastResetDay = new Date().getUTCDate();
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

    public runAnalysis(): { heatScores: HeatScores } {
        const volumes = this.dataBuffer1s.map(c => c.volume);
        const avgVolume = calculateSMA(volumes, this.settings.AVERAGE_VOLUME_WINDOW_S);
        
        const pad = (arr: (number|null)[], targetLength: number) => [...new Array(targetLength - arr.length).fill(null), ...arr];
        
        const preparedData: PreparedData = {
            candles: this.dataBuffer1s,
            avgVolume: pad(avgVolume, this.dataBuffer1s.length),
        };

        const heatScores = this.calculateHeat(preparedData);
        
        return { heatScores };
    }
    
    public calculateHeat(preparedData: PreparedData): HeatScores {
        const { candles, avgVolume } = preparedData;
        const emptyScores: HeatScores = { '1s': { buy: 0, sell: 0 } };
        
        if (candles.length < this.settings.VOLATILITY_WINDOW_S) {
            this.lastDynamicPriceThreshold = this.settings.BASE_PRICE_CHANGE_THRESHOLD;
            return emptyScores;
        }

        const volatilityCandles = candles.slice(-this.settings.VOLATILITY_WINDOW_S);
        
        const priceReturns = [];
        for (let i = 1; i < volatilityCandles.length; i++) {
            const prevClose = volatilityCandles[i-1].close;
            const currentClose = volatilityCandles[i].close;
            if (Number.isFinite(prevClose) && prevClose > 0 && Number.isFinite(currentClose)) {
                priceReturns.push((currentClose - prevClose) / prevClose);
            }
        }
        
        const calculatedVolatility = calculateStdDev(priceReturns) * 100;
        const volatility = Number.isFinite(calculatedVolatility) ? calculatedVolatility : 0;
        
        const dynamicPriceThreshold = this.settings.BASE_PRICE_CHANGE_THRESHOLD * (1 + this.settings.VOLATILITY_MULTIPLIER * volatility);
        this.lastDynamicPriceThreshold = dynamicPriceThreshold;

        const impulseWindow = this.settings.IMPULSE_WINDOW_S;
        if (candles.length < impulseWindow) return emptyScores;

        const recentCandles = candles.slice(-impulseWindow);
        const firstCandle = recentCandles[0];
        const lastCandle = recentCandles[recentCandles.length - 1];
        
        if (firstCandle.open === 0) {
            return emptyScores;
        }

        const priceChange = ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100;
        const recentVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0);
        const lastAvgVolume = avgVolume[avgVolume.length - 1];

        let buyHeat = 0;
        let sellHeat = 0;

        if (lastAvgVolume && lastAvgVolume > 0) {
            const volumeSpike = recentVolume / (lastAvgVolume * impulseWindow);

            if (Math.abs(priceChange) > dynamicPriceThreshold && volumeSpike > this.settings.VOLUME_SPIKE_FACTOR) {
                const priceExceedFactor = (Math.abs(priceChange) / dynamicPriceThreshold) - 1;
                const volumeExceedFactor = (volumeSpike / this.settings.VOLUME_SPIKE_FACTOR) - 1;
                
                const confidence = Math.min(
                    100, 
                    this.settings.CONFIDENCE_THRESHOLD + (priceExceedFactor * 15) + (volumeExceedFactor * 10)
                );
                
                if (priceChange > 0) {
                    buyHeat = confidence;
                } else {
                    sellHeat = confidence;
                }
            }
        }
        
        return {
            '1s': { buy: Math.round(buyHeat), sell: Math.round(sellHeat) },
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