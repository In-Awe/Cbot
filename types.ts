
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
    signal: 'bull' | 'bear' | 'neutral' | 'error';
    confidence: number;
    weight: number;
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
    meta: {
        [timeframe: string]: TimeframeAnalysis;
    };
    note?: string;
}

export interface Trade {
    id: string;
    pair: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    openedAt: Date;
    takeProfit: number;
    stopLoss: number;
}
