
import type { PriceHistoryLogEntry, StrategyConfig, Signal, TimeframeAnalysis, MarketRegime } from '../types';
import { calculateEMA, calculateRSI, calculateMACD, calculateATR } from './ta';

// --- TYPE DEFINITIONS & CONSTANTS ---

const BACKTEST_LOOKBACK_CANDLES = 1000;
const BACKTEST_TRADE_TIMEOUT_CANDLES = 40; // If a trade doesn't resolve in N candles, it's a draw.
const PROBABILITY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface KellyBotResult {
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    note: string;
    betSizeUSD?: number;
    last_price?: number;
    stop_loss?: number;
    take_profit?: number;
    regime?: MarketRegime;
    calibrated_win_p?: number;
    details?: Record<string, any>;
}

// Simple in-memory cache for backtest results to improve performance
const probabilityCache = new Map<string, { bull: number, bear: number, timestamp: number }>();


// --- UTILITY FUNCTIONS ---

const aggregateCandles = (candles: PriceHistoryLogEntry[], intervalMinutes: number): PriceHistoryLogEntry[] => {
    if (!candles || candles.length === 0 || intervalMinutes < 1) return [];
    const intervalMillis = intervalMinutes * 60 * 1000;
    const baseCandles = [...candles].sort((a,b) => a.id - b.id);
    if (baseCandles.length === 0) return [];
    
    const aggregated = [];
    let currentCandle: PriceHistoryLogEntry | null = null;

    for (const candle of baseCandles) {
        const candleInterval = Math.floor(candle.id / intervalMillis) * intervalMillis;
        if (!currentCandle || currentCandle.id !== candleInterval) {
            if (currentCandle) aggregated.push(currentCandle);
            currentCandle = { ...candle, id: candleInterval, timestamp: new Date(candleInterval) };
        } else {
            currentCandle.high = Math.max(currentCandle.high, candle.high);
            currentCandle.low = Math.min(currentCandle.low, candle.low);
            currentCandle.close = candle.close;
            currentCandle.volume += candle.volume;
        }
    }
    if (currentCandle) aggregated.push(currentCandle);
    return aggregated;
}

const calculateKellyBet = (winProbability: number, winLossRatio: number, capital: number, fraction: number) => {
    if (winProbability <= 0 || winLossRatio <= 0) return 0;
    const kellyFraction = winProbability - ((1 - winProbability) / winLossRatio);
    if (kellyFraction <= 0) return 0;
    return capital * kellyFraction * fraction;
}

// --- MODULE 1: MARKET REGIME ANALYSIS ---

const determineMarketRegime = (priceHistory: PriceHistoryLogEntry[], config: StrategyConfig): MarketRegime => {
    // 1. Trend Detection
    const trendCandles = aggregateCandles(priceHistory, config.regime_trend_timeframe_h * 60);
    let trend: MarketRegime['trend'] = 'Ranging';
    let trendDetails = {};
    if (trendCandles.length > config.regime_trend_slow_ema) {
        const trendCloses = trendCandles.map(c => c.close);
        const fastEMA = calculateEMA(trendCloses, config.regime_trend_fast_ema).pop();
        const slowEMA = calculateEMA(trendCloses, config.regime_trend_slow_ema).pop();
        if (fastEMA !== undefined && slowEMA !== undefined) {
             if (fastEMA > slowEMA * 1.01) trend = 'Uptrend'; // 1% buffer
             else if (fastEMA < slowEMA * 0.99) trend = 'Downtrend'; // 1% buffer
             trendDetails = { trend_ema_fast: fastEMA.toFixed(4), trend_ema_slow: slowEMA.toFixed(4) };
        }
    }

    // 2. Volatility Detection
    const signalInterval = parseInt(config.timeframes[0]);
    const signalCandles = aggregateCandles(priceHistory, signalInterval);
    let volatility: MarketRegime['volatility'] = 'Normal';
    let volDetails = {};
    if (signalCandles.length > config.regime_volatility_atr_period) {
        const atr = calculateATR(signalCandles, config.regime_volatility_atr_period).pop();
        const currentPrice = signalCandles[signalCandles.length - 1]?.close;
        if(atr !== undefined && currentPrice) {
            const atrPct = (atr / currentPrice) * 100;
            if (atrPct > config.regime_volatility_high_threshold_pct) volatility = 'High';
            else if (atrPct < config.regime_volatility_low_threshold_pct) volatility = 'Low';
            volDetails = { volatility_atr_pct: atrPct.toFixed(3) };
        }
    }

    return { volatility, trend, details: { ...trendDetails, ...volDetails } };
};


// --- MODULE 2: EMPIRICAL PROBABILITY CALIBRATION ---

const getSignalForBacktest = (candleSlice: PriceHistoryLogEntry[]) => {
    if (candleSlice.length < 100) return 'hold';
    const closes = candleSlice.map(c => c.close);
    const ema50 = calculateEMA(closes, 50).pop();
    const ema100 = calculateEMA(closes, 100).pop();
    const rsi = calculateRSI(closes, 14).pop();
    const macdResult = calculateMACD(closes, 12, 26, 9);
    const macdLine = macdResult.MACD.pop();
    const signalLine = macdResult.signal.pop();

    if (ema50 === undefined || ema100 === undefined || rsi === undefined || macdLine === undefined || signalLine === undefined) {
        return 'hold';
    }

    if (ema50 > ema100 && rsi > 55 && macdLine > signalLine) return 'buy';
    if (ema50 < ema100 && rsi < 45 && macdLine < signalLine) return 'sell';
    return 'hold';
};

const runSignalBacktest = (candles: PriceHistoryLogEntry[]) => {
    const R_R_RATIO = 2.0;
    const SL_PCT = 0.015;
    const TP_PCT = SL_PCT * R_R_RATIO;
    
    let bullWins = 0, bullTrades = 0;
    let bearWins = 0, bearTrades = 0;

    for (let i = 100; i < candles.length - BACKTEST_TRADE_TIMEOUT_CANDLES; i++) {
        const historySlice = candles.slice(0, i + 1);
        const signal = getSignalForBacktest(historySlice);

        if (signal === 'buy') {
            bullTrades++;
            const entryPrice = candles[i].close;
            const tp = entryPrice * (1 + TP_PCT);
            const sl = entryPrice * (1 - SL_PCT);
            for (let j = i + 1; j < i + BACKTEST_TRADE_TIMEOUT_CANDLES; j++) {
                if (candles[j].high >= tp) { bullWins++; break; }
                if (candles[j].low <= sl) { break; }
            }
        } else if (signal === 'sell') {
            bearTrades++;
            const entryPrice = candles[i].close;
            const tp = entryPrice * (1 - TP_PCT);
            const sl = entryPrice * (1 + SL_PCT);
            for (let j = i + 1; j < i + BACKTEST_TRADE_TIMEOUT_CANDLES; j++) {
                if (candles[j].low <= tp) { bearWins++; break; }
                if (candles[j].high >= sl) { break; }
            }
        }
    }
    
    return {
        bullWinRate: bullTrades > 10 ? bullWins / bullTrades : 0.50, // Default to 50% if not enough trades
        bearWinRate: bearTrades > 10 ? bearWins / bearTrades : 0.50,
    };
}

const getLiveSignalAndIndicators = (candleSlice: PriceHistoryLogEntry[]) => {
    const indicators: Record<string, number | undefined> = {
        ema50: undefined, ema100: undefined, rsi: undefined,
        macdLine: undefined, signalLine: undefined,
    };

    if (candleSlice.length < 100) return { signal: 'hold' as const, indicators };
    
    const closes = candleSlice.map(c => c.close);
    indicators.ema50 = calculateEMA(closes, 50).pop();
    indicators.ema100 = calculateEMA(closes, 100).pop();
    indicators.rsi = calculateRSI(closes, 14).pop();
    const macdResult = calculateMACD(closes, 12, 26, 9);
    indicators.macdLine = macdResult.MACD.pop();
    indicators.signalLine = macdResult.signal.pop();

    if (Object.values(indicators).some(v => v === undefined)) {
        return { signal: 'hold' as const, indicators };
    }

    let signal: 'buy' | 'sell' | 'hold' = 'hold';
    // Non-null assertion (!) because we just checked for undefined values above.
    if (indicators.ema50! > indicators.ema100! && indicators.rsi! > 55 && indicators.macdLine! > indicators.signalLine!) {
        signal = 'buy';
    } else if (indicators.ema50! < indicators.ema100! && indicators.rsi! < 45 && indicators.macdLine! < indicators.signalLine!) {
        signal = 'sell';
    }
    
    return { signal, indicators };
};


// --- MODULE 3: CORE ANALYSIS & SIZING LOGIC ---

const analyzeWithCalibratedKelly = (pair: string, priceHistory: PriceHistoryLogEntry[], config: StrategyConfig, livePrice: PriceHistoryLogEntry): KellyBotResult => {
    const signalInterval = parseInt(config.timeframes[0]);
    const signalCandles = aggregateCandles(priceHistory, signalInterval);
    const currentPrice = livePrice.close;

    if (signalCandles.length < 100) {
        return { action: 'hold', confidence: 0, note: `Not enough data (${signalCandles.length}/100)` };
    }

    // 1. Determine Market Regime
    const regime = determineMarketRegime(priceHistory, config);

    // 2. Generate Live Signal & get indicator values
    const { signal: liveSignal, indicators: liveIndicators } = getLiveSignalAndIndicators(signalCandles);
    const detailsForMeta = { ...regime.details, ...liveIndicators };

    if (liveSignal === 'hold') {
        return { action: 'hold', confidence: 0, note: 'No signal convergence', regime, details: detailsForMeta };
    }

    // 3. Calibrate Probability (with caching)
    const cachedProbs = probabilityCache.get(pair);
    let bullWinRate = 0.5, bearWinRate = 0.5;
    if(cachedProbs && (Date.now() - cachedProbs.timestamp < PROBABILITY_CACHE_TTL_MS)) {
        bullWinRate = cachedProbs.bull;
        bearWinRate = cachedProbs.bear;
    } else {
        const backtestCandles = signalCandles.slice(-BACKTEST_LOOKBACK_CANDLES);
        const rates = runSignalBacktest(backtestCandles);
        bullWinRate = rates.bullWinRate;
        bearWinRate = rates.bearWinRate;
        probabilityCache.set(pair, { bull: bullWinRate, bear: bearWinRate, timestamp: Date.now() });
    }

    const winProbability = liveSignal === 'buy' ? bullWinRate : bearWinRate;

    if (winProbability < 0.52) { // Minimum profitable edge
        return { action: 'hold', confidence: 0, note: `Low calibrated P(Win): ${(winProbability * 100).toFixed(1)}%`, regime, details: detailsForMeta };
    }

    // 4. Adjust Kelly Fraction based on Regime
    let adjustedFraction = config.kelly_fraction;
    if (regime.volatility === 'High') adjustedFraction *= 0.6;
    if (regime.volatility === 'Low') adjustedFraction *= 0.8;
    if (regime.trend === 'Ranging') adjustedFraction *= 0.7;
    if (regime.trend !== 'Ranging' && regime.volatility === 'Normal') adjustedFraction *= 1.2;
    adjustedFraction = Math.max(0.1, Math.min(1.0, adjustedFraction));

    // 5. Calculate Bet Size
    const winLossRatio = 2.0;
    const betSize = calculateKellyBet(winProbability, winLossRatio, config.total_capital_usd, adjustedFraction);

    if (betSize < 1) {
        return { action: 'hold', confidence: 0, note: 'Bet size too small', regime, details: detailsForMeta };
    }

    // 6. Define Trade Parameters
    const stopLoss = liveSignal === 'buy' ? currentPrice * (1 - 0.015) : currentPrice * (1 + 0.015);
    const takeProfit = liveSignal === 'buy' ? currentPrice * (1 + 0.03) : currentPrice * (1 - 0.03);

    return {
        action: liveSignal,
        confidence: winProbability,
        betSizeUSD: betSize,
        last_price: currentPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        regime: regime,
        calibrated_win_p: winProbability,
        note: `Regime: ${regime.trend}/${regime.volatility}. P(Win): ${(winProbability*100).toFixed(1)}%`,
        details: detailsForMeta,
    };
}


// --- PUBLIC EXPORT ---

export const runBotAnalysis = (pair: string, priceHistory: PriceHistoryLogEntry[], config: StrategyConfig, livePrice: PriceHistoryLogEntry): Signal | null => {
    
    const sortedHistory = [...priceHistory, livePrice].sort((a, b) => a.id - b.id);

    const result = analyzeWithCalibratedKelly(pair, sortedHistory, config, livePrice);

    const meta: TimeframeAnalysis[] = [{
        timeframe: config.timeframes[0] || 'N/A',
        signal: result.action === 'buy' ? 'bull' : result.action === 'sell' ? 'bear' : 'neutral',
        confidence: result.confidence,
        details: { ...result.details, regime: result.regime },
    }];

    return {
        pair,
        action: result.action,
        confidence: result.confidence || 0,
        score: result.confidence || 0,
        last_price: livePrice.close,
        take_profit: result.take_profit || null,
        stop_loss: result.stop_loss || null,
        betSizeUSD: result.betSizeUSD || 0,
        meta,
        note: result.note,
        regime: result.regime,
        calibrated_win_p: result.calibrated_win_p
    };
};
