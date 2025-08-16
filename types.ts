export interface StrategyConfig {
    exchange: string;
    trading_pairs: string[];
    total_capital_usd: number;
    kelly_fraction: number; // This will now be the base fraction
    max_concurrent_trades: number;
    entry_window_s: number;
    exit_timeout_s: number;
    timeframes: string[]; // Primary timeframe for signals

    // New Regime and Calibration Settings
    regime_trend_timeframe_h: number; // Timeframe in hours for trend analysis
    regime_trend_fast_ema: number;
    regime_trend_slow_ema: number;
    regime_volatility_atr_period: number;
    regime_volatility_high_threshold_pct: number; // ATR as % of price
    regime_volatility_low_threshold_pct: number; // ATR as % of price
}

export interface MarketRegime {
    volatility: 'High' | 'Normal' | 'Low';
    trend: 'Uptrend' | 'Downtrend' | 'Ranging';
    details: {
        trend_ema_fast?: number;
        trend_ema_slow?: number;
        volatility_atr_pct?: number;
    }
}


export interface TimeframeAnalysis {
    timeframe: string;
    signal: 'bull' | 'bear' | 'neutral' | 'error';
    confidence: number;
    weight?: number;
    error?: string;
    details?: Record<string, string | number | MarketRegime>;
}

export interface Signal {
    pair: string;
    action: 'buy' | 'sell' | 'hold';
    confidence: number; // This is now the calibrated win probability
    score: number;
    last_price: number | null;
    take_profit: number | null;
    stop_loss: number | null;
    meta: TimeframeAnalysis[];
    note?: string;
    suggested_take_profit_pct?: number;
    suggested_stop_loss_pct?: number;
    betSizeUSD?: number;
    regime?: MarketRegime;
    calibrated_win_p?: number;
}

export interface Trade {
    id: string;
    pair: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    openedAt: Date;
    takeProfit: number;
    stopLoss: number;
    status: 'pending' | 'active' | 'closed';
    tradeAmountUSD: number;
    exitPrice?: number;
    closedAt?: Date;
    pnl?: number;
    initialConfidence?: number;
    initialSignalMeta?: TimeframeAnalysis[];
}

export interface AnalysisLogEntry {
    id: string;
    timestamp: Date;
    pair: string;
    price: number;
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    meta: TimeframeAnalysis[];
}

export type SimulationStatus = 'stopped' | 'running' | 'paused' | 'warming up';

export interface TerminalLogEntry {
    id: number;
    timestamp: Date;
    type: 'info' | 'request' | 'response' | 'error' | 'warn';
    message: string;
    data?: string; // Optional stringified JSON data
}

export interface PriceHistoryLogEntry {
    id: number; // Timestamp
    timestamp: Date;
    pair: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    interval: '1m' | '15s' | '1s';
}


export interface PredictionAccuracyRecord {
    id: string;
    pair: string;
    timeframe: string;
    predictedSignal: 'bull' | 'bear';
    predictionTime: number;
    startPrice: number;
    status: 'pending' | 'resolved';
    endTime?: number;
    endPrice?: number;
    outcome?: 'UP' | 'DOWN' | 'SIDEWAYS';
    success?: boolean;
}

export type AnalysisEngine = 'gemini' | 'internal';