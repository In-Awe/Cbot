// A collection of basic Technical Analysis helper functions.

import type { PriceHistoryLogEntry } from '../types';


/**
 * Calculates the Simple Moving Average (SMA) for a given period.
 * @param prices - Array of numbers (e.g., closing prices).
 * @param period - The lookback period for the SMA.
 * @returns An array of SMA values.
 */
export const calculateSMA = (prices: number[], period: number): number[] => {
    if (prices.length < period) return [];
    const sma: number[] = [];
    let sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
    sma.push(sum / period);

    for (let i = period; i < prices.length; i++) {
        sum = sum - prices[i - period] + prices[i];
        sma.push(sum / period);
    }
    return sma;
};

/**
 * Calculates the Exponential Moving Average (EMA) for a given period.
 * @param prices - Array of numbers (e.g., closing prices).
 * @param period - The lookback period for the EMA.
 * @returns An array of EMA values.
 */
export const calculateEMA = (prices: number[], period: number): number[] => {
    if (prices.length < period) return [];
    const multiplier = 2 / (period + 1);
    const ema: number[] = [];

    // The first EMA value is the SMA of the first 'period' prices
    let previousEma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    ema.push(previousEma);

    for (let i = period; i < prices.length; i++) {
        const currentEma = (prices[i] - previousEma) * multiplier + previousEma;
        ema.push(currentEma);
        previousEma = currentEma;
    }

    return ema;
};

/**
 * Calculates the Relative Strength Index (RSI) for a given period.
 * @param prices - Array of numbers (e.g., closing prices).
 * @param period - The lookback period for the RSI.
 * @returns An array of RSI values.
 */
export const calculateRSI = (prices: number[], period: number): number[] => {
    if (prices.length <= period) return [];

    const rsi: number[] = [];
    let avgGain = 0;
    let avgLoss = 0;

    // Calculate initial average gain and loss
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) {
            avgGain += change;
        } else {
            avgLoss -= change;
        }
    }
    avgGain /= period;
    avgLoss /= period;

    let rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));

    // Calculate subsequent RSI values
    for (let i = period + 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        let gain = change > 0 ? change : 0;
        let loss = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
        rsi.push(100 - 100 / (1 + rs));
    }
    
    return rsi;
};


/**
 * Calculates Bollinger Bands (Middle, Upper, Lower) for a given period.
 * @param prices - Array of numbers (e.g., closing prices).
 * @param period - The lookback period for the bands.
 * @param stdDev - The number of standard deviations for the upper/lower bands.
 * @returns An object containing arrays for the middle, upper, and lower bands.
 */
export const calculateBollingerBands = (prices: number[], period: number, stdDev: number) => {
    if (prices.length < period) return { middle: [], upper: [], lower: [] };
    const middle = calculateSMA(prices, period);
    const upper: number[] = [];
    const lower: number[] = [];
    
    for(let i = 0; i < middle.length; i++) {
        const slice = prices.slice(i, i + period);
        const variance = slice.reduce((a, b) => a + (b - middle[i]) ** 2, 0) / period;
        const std = Math.sqrt(variance);
        upper.push(middle[i] + stdDev * std);
        lower.push(middle[i] - stdDev * std);
    }

    return { middle, upper, lower };
};

/**
 * Calculates Moving Average Convergence Divergence (MACD).
 * @param prices - Array of closing prices.
 * @param fastPeriod - Typically 12.
 * @param slowPeriod - Typically 26.
 * @param signalPeriod - Typically 9.
 * @returns An object with MACD line, signal line, and histogram arrays.
 */
export const calculateMACD = (prices: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
    const emaFast = calculateEMA(prices, fastPeriod);
    const emaSlow = calculateEMA(prices, slowPeriod);
    
    // Align arrays by taking the tail of the longer one
    const macdLine = emaFast.slice(slowPeriod - fastPeriod).map((val, i) => val - emaSlow[i]);
    const signalLine = calculateEMA(macdLine, signalPeriod);
    
    // Align again
    const histogram = macdLine.slice(signalPeriod -1).map((val, i) => val - signalLine[i]);

    return {
        MACD: macdLine.slice(signalPeriod -1),
        signal: signalLine,
        histogram: histogram,
    };
};

/**
 * Calculates the Average True Range (ATR) using a Simple Moving Average.
 * @param candles - Array of candle objects with high, low, close properties.
 * @param period - The lookback period, typically 14.
 * @returns An array of ATR values.
 */
export const calculateATR = (candles: { high: number; low: number; close: number }[], period: number): number[] => {
    if (candles.length <= 1) return [];

    const trueRanges: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = candles[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trueRanges.push(tr);
    }
    
    // Use SMA on True Range, which is what the Python script does
    return calculateSMA(trueRanges, period);
};