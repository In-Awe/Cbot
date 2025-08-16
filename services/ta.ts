
// A collection of basic Technical Analysis helper functions.

import type { PriceHistoryLogEntry } from '../types';

/**
 * Calculates Wilder's Moving Average, used in indicators like RSI and ADX.
 * @param prices - Array of numbers.
 * @param period - The lookback period.
 * @returns An array of Wilder's MA values.
 */
export const calculateWilderMA = (prices: number[], period: number): number[] => {
    if (prices.length < period) return Array(prices.length).fill(0); // Return array of 0s if not enough data
    const wma: number[] = new Array(prices.length).fill(0);
    
    // Initial SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += prices[i];
    }
    wma[period - 1] = sum / period;

    // Subsequent Wilder's MA
    for (let i = period; i < prices.length; i++) {
        wma[i] = (wma[i - 1] * (period - 1) + prices[i]) / period;
    }
    return wma;
};


/**
 * Calculates the Simple Moving Average (SMA) for a given period.
 * @param prices - Array of numbers (e.g., closing prices).
 * @param period - The lookback period for the SMA.
 * @returns An array of SMA values.
 */
export const calculateSMA = (prices: number[], period: number): number[] => {
    if (prices.length < period) return [];
    const sma: number[] = new Array(prices.length - period + 1).fill(0);
    let sum = 0;
    for(let i = 0; i < period; i++) {
        sum += prices[i];
    }
    sma[0] = sum / period;

    for (let i = period; i < prices.length; i++) {
        sum = sum - prices[i-period] + prices[i];
        sma[i - period + 1] = sum / period;
    }
    return sma;
};

/**
 * Calculates the Exponential Moving Average (EMA) for a given period.
 * @param prices - Array of numbers (e.g., closing prices).
 * @param period - The lookback period for the EMA.
 * @returns An array of EMA values, not padded.
 */
export const calculateEMA = (prices: number[], period: number): number[] => {
    if (prices.length < period) return [];
    const multiplier = 2 / (period + 1);
    const ema: number[] = [];

    let sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    ema.push(sma);

    for (let i = period; i < prices.length; i++) {
        const nextEma = (prices[i] - ema[ema.length-1]) * multiplier + ema[ema.length-1];
        ema.push(nextEma);
    }
    
    return ema;
};

/**
 * Calculates Bollinger Bands (Middle, Upper, Lower, and Width) for a given period.
 * @param prices - Array of numbers (e.g., closing prices).
 * @param period - The lookback period for the bands.
 * @param stdDev - The number of standard deviations for the upper/lower bands.
 * @returns An object containing arrays for the middle, upper, lower bands, and bbw.
 */
export const calculateBollingerBands = (prices: number[], period: number, stdDev: number) => {
    if (prices.length < period) return { middle: [], upper: [], lower: [], bbw: [] };
    
    const middle: number[] = [];
    const upper: number[] = [];
    const lower: number[] = [];
    const bbw: number[] = [];

    for (let i = period - 1; i < prices.length; i++) {
        const slice = prices.slice(i - period + 1, i + 1);
        const sma = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
        const std = Math.sqrt(variance);
        
        const upperBand = sma + (stdDev * std);
        const lowerBand = sma - (stdDev * std);
        
        middle.push(sma);
        upper.push(upperBand);
        lower.push(lowerBand);
        bbw.push(sma > 1e-12 ? (upperBand - lowerBand) / sma : 0);
    }

    return { middle, upper, lower, bbw };
};

/**
 * Calculates the Relative Strength Index (RSI).
 * @param prices - Array of numbers (e.g., closing prices).
 * @param period - The lookback period for the RSI.
 * @returns An array of RSI values, not padded.
 */
export const calculateRSI = (prices: number[], period: number): number[] => {
    if (prices.length <= period) return [];

    const rsi: number[] = [];
    const changes = prices.slice(1).map((price, i) => price - prices[i]);
    
    let gains = 0;
    let losses = 0;

    // Initial average gain/loss
    for (let i = 0; i < period; i++) {
        if (changes[i] > 0) {
            gains += changes[i];
        } else {
            losses -= changes[i];
        }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period; i < changes.length + 1; i++) {
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const currentRsi = 100 - (100 / (1 + rs));
        rsi.push(currentRsi);

        if (i < changes.length) {
            const currentChange = changes[i];
            let currentGain = 0;
            let currentLoss = 0;

            if (currentChange > 0) {
                currentGain = currentChange;
            } else {
                currentLoss = -currentChange;
            }

            avgGain = (avgGain * (period - 1) + currentGain) / period;
            avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
        }
    }
    
    return rsi;
};
