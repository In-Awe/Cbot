
import type { StrategyConfig } from './types';

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
    exchange: "Binance",
    trading_pairs: ["ZORA/USDT", "MATIC/USDT", "LINK/USDT", "ARB/USDT", "ETH/USDT"],
    trade_amount_usd: 20.0,
    max_concurrent_trades: 2,
    take_profit_pct: 3.0,
    stop_loss_pct: 1.5,
    entry_window_s: 30,
    exit_timeout_s: 600,
    timeframes: ["1m", "5m", "15m", "1h", "4h", "1d"],
    short_ma: 20,
    long_ma: 50,
    rsi_period: 14,
};

export const AVAILABLE_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "3d", "1w"];
