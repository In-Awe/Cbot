
export interface StrategyConfig {
    exchange: string;
    trading_pairs: string[];
    trade_amount_usd: number;
    max_concurrent_trades: number;
    take_profit_pct: number;
    stop_loss_pct: number;
    entry_window_s: number;
    exit_timeout_s: number;
    timeframes: string[];
    short_ma: number;
    long_ma: number;
    rsi_period: number;
}

export interface TimeframeAnalysis {
    timeframe: string;
    signal: 'bull' | 'bear' | 'neutral' | 'error';
    confidence: number;
    weight?: number;
    error?: string;
}

export interface Signal {
    pair: string;
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    score: number;
    last_price: number | null;
    take_profit: number | null;
    stop_loss: number | null;
    meta: TimeframeAnalysis[];
    note?: string;
    suggested_take_profit_pct?: number;
    suggested_stop_loss_pct?: number;
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

export type SimulationStatus = 'stopped' | 'running' | 'paused';

export interface TerminalLogEntry {
    id: number;
    timestamp: Date;
    type: 'info' | 'request' | 'response' | 'error';
    message: string;
    data?: string; // Optional stringified JSON data
}
