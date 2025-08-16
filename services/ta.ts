
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
    const sma: number[] = new Array(prices.length).fill(0);
    for (let i = period - 1; i < prices.length; i++) {
        const slice = prices.slice(i - period + 1, i + 1);
        const sum = slice.reduce((a, b) => a + b, 0);
        sma[i] = sum / period;
    }
    return sma.slice(period - 1);
};

/**
 * Calculates the Exponential Moving Average (EMA) for a given period.
 * @param prices - Array of numbers (e.g., closing prices).
 * @param period - The lookback period for the EMA.
 * @returns An array of EMA values.
 */
export const calculateEMA = (prices: number[], period: number): number[] => {
    if (prices.length < period) return Array(prices.length).fill(0);
    const multiplier = 2 / (period + 1);
    const ema: number[] = new Array(prices.length).fill(0);

    let sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    ema[period - 1] = sma;

    for (let i = period; i < prices.length; i++) {
        ema[i] = (prices[i] - ema[i-1]) * multiplier + ema[i-1];
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


export const calculateADX = (candles: { high: number; low: number; close: number }[], period: number) => {
    if (candles.length < period + 1) return { adx: [], pdi: [], mdi: [] };

    const plusDMs: number[] = [0];
    const minusDMs: number[] = [0];
    const trs: number[] = [0];

    for (let i = 1; i < candles.length; i++) {
        const upMove = candles[i].high - candles[i - 1].high;
        const downMove = candles[i - 1].low - candles[i].low;

        plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);

        trs.push(Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close)
        ));
    }

    const smoothedPlusDM = calculateWilderMA(plusDMs, period);
    const smoothedMinusDM = calculateWilderMA(minusDMs, period);
    const smoothedTR = calculateWilderMA(trs, period);

    const pdis: number[] = [];
    const mdis: number[] = [];
    const dxs: number[] = [];

    for (let i = 0; i < candles.length; i++) {
        if (smoothedTR[i] > 0) {
            pdis[i] = 100 * (smoothedPlusDM[i] / smoothedTR[i]);
            mdis[i] = 100 * (smoothedMinusDM[i] / smoothedTR[i]);
            const sum = pdis[i] + mdis[i];
            dxs[i] = sum === 0 ? 0 : (100 * Math.abs(pdis[i] - mdis[i])) / sum;
        } else {
            pdis[i] = 0;
            mdis[i] = 0;
            dxs[i] = 0;
        }
    }

    const adx = calculateWilderMA(dxs, period);
    
    const validLength = candles.length - (period -1) - (period-1);
    if(validLength <= 0) return { adx: [], pdi: [], mdi: [] };

    return { 
      adx: adx.slice(adx.length - validLength),
      pdi: pdis.slice(pdis.length - validLength),
      mdi: mdis.slice(mdis.length - validLength)
    };
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


export const calculateMACD = (prices: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
    const emaFast = calculateEMA(prices, fastPeriod);
    const emaSlow = calculateEMA(prices, slowPeriod);
    
    // Align arrays
    const alignedEmaFast = emaFast.slice(slowPeriod - fastPeriod);
    const alignedEmaSlow = emaSlow;

    const macdLine = alignedEmaFast.map((val, i) => val - alignedEmaSlow[i]);
    const signalLine = calculateEMA(macdLine, signalPeriod);
    
    const alignedMacdLine = macdLine.slice(signalPeriod-1);
    const histogram = alignedMacdLine.map((val, i) => val - signalLine[i]);

    return {
        MACD: alignedMacdLine,
        signal: signalLine,
        histogram: histogram,
    };
};


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
    
    if (trueRanges.length === 0) return [];

    return calculateWilderMA(trueRanges, period).slice(period - 1);
};
