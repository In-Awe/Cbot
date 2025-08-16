
export interface StrategyConfig {
    trading_pairs: string[];
    total_capital_usd: number;
    max_concurrent_trades: number;

    // Global Settings ('Leviathan' Engine)
    bband_period: number;
    bband_std_dev: number;
    trailing_stop_percent: number; // Final trailing stop after TPs are hit

    // Simulation Realism (Kept for backtester)
    fee_pct: number;
    slippage_pct_perc: number;
    
    // Backtest Safety (Kept for backtester)
    max_drawdown_pct: number;
}

// For Gemini AI Engine responses
export interface Signal {
    pair: string;
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    score: number;
    last_price?: number;
    take_profit?: number;
    stop_loss?: number;
    meta: {
        timeframe: string;
        signal: 'bull' | 'bear' | 'neutral' | 'error';
        confidence: number;
        error?: string;
    }[];
    note?: string;
    suggested_take_profit_pct?: number;
    suggested_stop_loss_pct?: number;
}

// Replaces 'Signal' as the bot now waits for breakout entries
export interface PendingOrder {
    pair: string;
    direction: 'BUY' | 'SELL';
    entryPrice: number;
    stopLoss: number;
}


export interface Trade {
    id: string;
    pair: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    openedAt: Date;
    status: 'active' | 'closed';
    
    // --- Leviathan Specific ---
    sizeUnits: number; // Position size is now in base asset units, not USD
    initialStopLoss: number; // The stop loss at the time of entry
    stopLoss: number; // The current, dynamic stop loss
    tp1Hit: boolean; // Flag for first partial take-profit
    tp2Hit: boolean; // Flag for second partial take-profit
    
    exitPrice?: number;
    closedAt?: Date;
    pnl?: number;
    reason?: string; // Exit reason

    // For trailing stop
    highWaterMark?: number;
    lowWaterMark?: number;
}

export interface AnalysisLogEntry {
    id: string;
    timestamp: Date;
    pair: string;
    price: number;
    action: 'setup_buy' | 'setup_sell' | 'hold';
    note: string;
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