// A collection of basic Technical Analysis helper functions.

import type { PriceHistoryLogEntry } from '../types';

/**
 * Calculates the Standard Deviation of a series of numbers.
 * @param arr - Array of numbers.
 * @returns The standard deviation.
 */
export const calculateStdDev = (arr: number[]): number => {
    // Filter out non-finite numbers to prevent NaN results.
    const finiteArr = arr.filter(n => Number.isFinite(n));
    const n = finiteArr.length;
    if (n === 0) return 0;

    const mean = finiteArr.reduce((a, b) => a + b) / n;
    const variance = finiteArr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    return Math.sqrt(variance);
};

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
 * Calculates Bollinger Bands (Middle, Upper, Lower) for a given period.
 * @param prices - Array of numbers (e.g., closing prices).
 * @param period - The lookback period for the bands.
 * @param stdDevMultiplier - The number of standard deviations for the upper/lower bands.
 * @returns An object containing arrays for the middle, upper, and lower bands.
 */
export const calculateBollingerBands = (prices: number[], period: number, stdDevMultiplier: number): { middle: number[], upper: number[], lower: number[] } => {
    if (prices.length < period) {
        return { middle: [], upper: [], lower: [] };
    }

    const middle: number[] = [];
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = period - 1; i < prices.length; i++) {
        const slice = prices.slice(i - period + 1, i + 1);
        const sma = slice.reduce((a, b) => a + b, 0) / period;
        const stdDev = calculateStdDev(slice);

        middle.push(sma);
        upper.push(sma + (stdDev * stdDevMultiplier));
        lower.push(sma - (stdDev * stdDevMultiplier));
    }

    return { middle, upper, lower };
};
