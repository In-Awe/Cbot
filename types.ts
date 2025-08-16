export interface StrategyConfig {
    trading_pairs: string[];
    total_capital_usd: number;
    max_concurrent_trades: number;

    // High-level risk management for the Adaptive Kelly Bot
    base_kelly_fraction: number; // User-controlled safety multiplier for the Kelly bet size.
    max_bet_pct: number;      // Hard cap on position size as a percentage of total capital.
    
    // Bot's internal learning parameters (less frequently changed)
    fractional_kelly: number; // Additional shrinkage factor applied to the raw Kelly fraction.
    min_samples_for_bucket: number; // Minimum historical trades required to fully trust empirical win rates.
    ewma_alpha: number;       // The learning rate (smoothing factor) for updating win-rate estimates.
}

export interface MarketRegime {
    volatility: 'High' | 'Normal' | 'Low';
    trend: 'Uptrend' | 'Downtrend' | 'Ranging';
    details: {
        trend_ema_fast?: number;
        trend_ema_slow?: number;
        volatility_atr_pct?: string; // Stored as string for display
    }
}


export interface TimeframeAnalysis {
    timeframe: string;
    confidence: number;
    signal: 'bull' | 'bear' | 'hold' | 'neutral' | 'error';
    score?: number; // Optional as Gemini doesn't provide it.
    samples?: number; // Optional as Gemini doesn't provide it.
    details?: Record<string, string | number | MarketRegime>;
    error?: string | null; // From Gemini
}

export interface Signal {
    pair: string;
    action: 'buy' | 'sell' | 'hold';
    // Aggregate values
    confidence: number; // This is now the aggregate win probability
    strength: number; // Aggregate score strength
    betSizeUSD?: number;
    // Base data
    last_price: number | null;
    take_profit: number | null;
    stop_loss: number | null;
    // Breakdown
    meta: TimeframeAnalysis[];
    note?: string;
    regime?: MarketRegime;
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

export type SimulationStatus = 'stopped' | 'running' | 'paused' | 'warming up' | 'backtesting' | 'backtest_complete';

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
