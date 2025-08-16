import type { StrategyConfig } from './types';

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
    exchange: "Binance",
    trading_pairs: ["ETH/USDT", "BTC/USDT", "SOL/USDT"],
    total_capital_usd: 1000.0,
    kelly_fraction: 0.5, // Base fraction, will be adjusted by regime
    max_concurrent_trades: 2,
    entry_window_s: 30,
    exit_timeout_s: 600,
    timeframes: ["15m"], // Primary timeframe for signal generation

    // New Regime and Calibration Settings
    regime_trend_timeframe_h: 4, // 4-hour chart for trend
    regime_trend_fast_ema: 50,
    regime_trend_slow_ema: 200,
    regime_volatility_atr_period: 14,
    regime_volatility_high_threshold_pct: 0.8, // ATR as % of price is high vol
    regime_volatility_low_threshold_pct: 0.3,  // ATR as % of price is low vol
};

export const AVAILABLE_TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "3d", "1w"];

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
 * Calibrated Kelly Bot v3.0
 * This strategy enhances the Kelly Criterion approach by:
 * 1. Empirically calibrating win probabilities via a high-speed backtest.
 * 2. Detecting the current market regime (Trend and Volatility).
 * 3. Adjusting the Kelly fraction based on the detected regime to manage risk.
 */

// Assuming 'ta' object with ema, rsi, macd, atr functions is available.
declare const ta: any;

// --- UTILITY FUNCTIONS ---
function aggregateCandles(candles, intervalMinutes) {
    if (!candles || candles.length === 0 || intervalMinutes < 1) return [];
    const intervalMillis = intervalMinutes * 60 * 1000;
    const baseCandles = [...candles].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (baseCandles.length === 0) return [];
    
    const aggregated = [];
    let currentCandle = null;
    for (const candle of baseCandles) {
        const candleTime = new Date(candle.timestamp).getTime();
        const candleInterval = Math.floor(candleTime / intervalMillis) * intervalMillis;
        if (!currentCandle || currentCandle.timestamp !== candleInterval) {
            if (currentCandle) aggregated.push(currentCandle);
            currentCandle = { ...candle, timestamp: candleInterval };
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

function calculateKellyBet(winProbability, winLossRatio, capital, fraction) {
    if (winProbability <= 0 || winLossRatio <= 0) return 0;
    const kellyFraction = winProbability - ((1 - winProbability) / winLossRatio);
    if (kellyFraction <= 0) return 0;
    return capital * kellyFraction * fraction;
}

// --- MODULE 1: MARKET REGIME ANALYSIS ---
function determineMarketRegime(priceHistory, config) {
    // 1. Trend Detection
    const trendCandles = aggregateCandles(priceHistory, config.regime_trend_timeframe_h * 60);
    let trend = 'Ranging';
    let trendDetails = {};
    if (trendCandles.length > config.regime_trend_slow_ema) {
        const trendCloses = trendCandles.map(c => c.close);
        const fastEMA = ta.ema(trendCloses, config.regime_trend_fast_ema).pop();
        const slowEMA = ta.ema(trendCloses, config.regime_trend_slow_ema).pop();
        if (fastEMA > slowEMA * 1.01) trend = 'Uptrend';
        else if (fastEMA < slowEMA * 0.99) trend = 'Downtrend';
        trendDetails = { trend_ema_fast: fastEMA, trend_ema_slow: slowEMA };
    }

    // 2. Volatility Detection
    const signalCandles = aggregateCandles(priceHistory, parseInt(config.timeframes[0]));
    let volatility = 'Normal';
    let volDetails = {};
    if (signalCandles.length > config.regime_volatility_atr_period) {
        const atr = ta.atr(signalCandles, config.regime_volatility_atr_period).pop();
        const currentPrice = signalCandles[signalCandles.length - 1].close;
        const atrPct = (atr / currentPrice) * 100;
        if (atrPct > config.regime_volatility_high_threshold_pct) volatility = 'High';
        else if (atrPct < config.regime_volatility_low_threshold_pct) volatility = 'Low';
        volDetails = { volatility_atr_pct: atrPct };
    }

    return { volatility, trend, details: { ...trendDetails, ...volDetails } };
}

// --- MODULE 2: EMPIRICAL PROBABILITY CALIBRATION ---
function runSignalBacktest(candles, signalLogic) {
    const TIMEOUT = 40; // 40 candles timeout for a trade
    const R_R_RATIO = 2.0;
    const SL_PCT = 0.015;
    const TP_PCT = SL_PCT * R_R_RATIO;
    
    let bullWins = 0, bullTrades = 0;
    let bearWins = 0, bearTrades = 0;

    for (let i = 100; i < candles.length - TIMEOUT; i++) {
        const historySlice = candles.slice(0, i + 1);
        const signal = signalLogic(historySlice);

        if (signal === 'buy') {
            bullTrades++;
            const entryPrice = candles[i].close;
            const tp = entryPrice * (1 + TP_PCT);
            const sl = entryPrice * (1 - SL_PCT);
            for (let j = i + 1; j < i + TIMEOUT; j++) {
                if (candles[j].high >= tp) { bullWins++; break; }
                if (candles[j].low <= sl) { break; }
            }
        } else if (signal === 'sell') {
            bearTrades++;
            const entryPrice = candles[i].close;
            const tp = entryPrice * (1 - TP_PCT);
            const sl = entryPrice * (1 + SL_PCT);
            for (let j = i + 1; j < i + TIMEOUT; j++) {
                if (candles[j].low <= tp) { bearWins++; break; }
                if (candles[j].high >= sl) { break; }
            }
        }
    }
    return {
        bullWinRate: bullTrades > 10 ? bullWins / bullTrades : 0.5,
        bearWinRate: bearTrades > 10 ? bearWins / bearTrades : 0.5,
    };
}

// --- MODULE 3: CORE ANALYSIS & SIZING LOGIC ---
function analyze(pair, priceHistory, config) {
    const signalInterval = parseInt(config.timeframes[0]);
    const signalCandles = aggregateCandles(priceHistory, signalInterval);
    const currentPrice = signalCandles[signalCandles.length - 1].close;

    // 1. Determine Market Regime
    const regime = determineMarketRegime(priceHistory, config);

    // 2. Define Signal Logic (for backtesting and live signal)
    const getSignal = (candleSlice) => {
        const closes = candleSlice.map(c => c.close);
        const ema50 = ta.ema(closes, 50).pop();
        const ema100 = ta.ema(closes, 100).pop();
        const rsi = ta.rsi(closes, 14).pop();
        const macd = ta.macd(closes, 12, 26, 9);
        const macdLine = macd.MACD.pop();
        const signalLine = macd.signal.pop();
        
        if(ema50 > ema100 && rsi > 55 && macdLine > signalLine) return 'buy';
        if(ema50 < ema100 && rsi < 45 && macdLine < signalLine) return 'sell';
        return 'hold';
    };

    // 3. Generate Live Signal
    const liveSignal = getSignal(signalCandles);
    if (liveSignal === 'hold') {
        return { action: 'hold', note: 'No signal convergence' };
    }

    // 4. Calibrate Probability (using a subset of history for speed)
    const backtestCandles = signalCandles.slice(-1000);
    const { bullWinRate, bearWinRate } = runSignalBacktest(backtestCandles, getSignal);
    const winProbability = liveSignal === 'buy' ? bullWinRate : bearWinRate;

    if (winProbability < 0.52) { // Minimum edge
        return { action: 'hold', note: \`Low calibrated P(Win): \${(winProbability*100).toFixed(1)}%\` };
    }

    // 5. Adjust Kelly Fraction based on Regime
    let adjustedFraction = config.kelly_fraction;
    if (regime.volatility === 'High') adjustedFraction *= 0.6;
    if (regime.volatility === 'Low') adjustedFraction *= 0.8;
    if (regime.trend === 'Ranging') adjustedFraction *= 0.7;
    if (regime.trend !== 'Ranging' && regime.volatility === 'Normal') adjustedFraction *= 1.2;
    adjustedFraction = Math.max(0.1, Math.min(1.0, adjustedFraction));

    // 6. Calculate Bet Size
    const winLossRatio = 2.0;
    const betSize = calculateKellyBet(winProbability, winLossRatio, config.total_capital_usd, adjustedFraction);

    if (betSize < 1) {
        return { action: 'hold', note: 'Bet size too small' };
    }

    // 7. Define Trade Parameters
    const stopLoss = liveSignal === 'buy' ? currentPrice * 0.985 : currentPrice * 1.015;
    const takeProfit = liveSignal === 'buy' ? currentPrice * 1.03 : currentPrice * 0.97;

    return {
        action: liveSignal,
        confidence: winProbability,
        betSizeUSD: betSize,
        last_price: currentPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        regime: regime,
        note: \`Regime: \${regime.trend}/\${regime.volatility}. P(Win): \${(winProbability*100).toFixed(1)}%\`,
    };
}
`;