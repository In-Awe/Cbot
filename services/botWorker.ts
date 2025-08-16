/// <reference lib="webworker" />

import { XrpUsdTrader } from './botService';
import { fetchKlinesSince } from './binanceService';
import type { PriceHistoryLogEntry, Trade, AnalysisLogEntry } from '../types';

// This declares the worker's global scope for TypeScript
declare const self: DedicatedWorkerGlobalScope;

let botInstance: XrpUsdTrader | null = null;
let mainInterval: number | null = null;
const TRADING_PAIR = 'XRP/USDT';
const TICK_INTERVAL = 2000; // 2 seconds

let openTrades: Trade[] = []; // Manage open trades within the worker

const runMainTick = async () => {
    if (!botInstance) {
        self.postMessage({ type: 'log', payload: { message: 'Bot not initialized for analysis.', level: 'error' } });
        return;
    }

    try {
        const ROLLING_WINDOW_SECONDS = 360; // 6 minutes
        const startTime = Date.now() - ROLLING_WINDOW_SECONDS * 1000;
        const recentKlines = await fetchKlinesSince(TRADING_PAIR, '1s', startTime);

        // CRITICAL FIX: The bot's strategy requires a full, fresh rolling window on every tick
        // for its calculations. initializeBuffer replaces the entire internal dataset, while the
        // previous updateWithNewCandles only appended data, leading to incorrect analysis.
        if (recentKlines.length > 0) {
            botInstance.initializeBuffer(recentKlines);
        }

        const { heatScores: newHeatScores } = botInstance.runAnalysis();

        // Manage trades
        const latestLivePriceEntry = recentKlines.length > 0 ? recentKlines[recentKlines.length - 1] : null;
        const latestLivePrice = latestLivePriceEntry?.close ?? 0;
            
        const dailyTradeLimit = botInstance.getDailyTradeLimit();
        const dailyTradeCount = botInstance.getDailyTradeCount();
        const canTrade = dailyTradeCount < dailyTradeLimit && openTrades.length === 0;

        let tradeToOpen: { direction: 'LONG' | 'SHORT'; reason: string } | null = null;
        const CONFIDENCE_THRESHOLD = botInstance.getConfidenceThreshold();

        if (canTrade && newHeatScores['1s']) {
            if (newHeatScores['1s'].buy >= CONFIDENCE_THRESHOLD) {
                tradeToOpen = { direction: 'LONG', reason: `1s Buy Impulse at ${newHeatScores['1s'].buy}% confidence` };
            } else if (newHeatScores['1s'].sell >= CONFIDENCE_THRESHOLD) {
                tradeToOpen = { direction: 'SHORT', reason: `1s Sell Impulse at ${newHeatScores['1s'].sell}% confidence` };
            }
        }
                
        const dynamicThreshold = botInstance.getLastDynamicPriceThreshold();
        const note = newHeatScores['1s']
            ? `Impulse 1s (Buy/Sell): ${newHeatScores['1s'].buy}/${newHeatScores['1s'].sell}. Dyn. Thresh: ${dynamicThreshold.toFixed(4)}%`
            : 'Waiting for impulse signals.';

        const analysisEntry: AnalysisLogEntry = {
            id: `analysis-${Date.now()}`,
            timestamp: new Date(),
            pair: TRADING_PAIR,
            price: latestLivePrice,
            action: tradeToOpen ? 'setup_found' : 'hold',
            note: tradeToOpen ? `${tradeToOpen.reason}. ${note}`: note,
        };
        
        let newTradeResult = null;
        if (tradeToOpen) {
            // use last 5 mins of 1s data for SL range from the full buffer.
            const consolidationSlice = botInstance.getRecentCandles(300);
            if (consolidationSlice.length > 0) {
                 const high = Math.max(...consolidationSlice.map(c => c.high));
                 const low = Math.min(...consolidationSlice.map(c => c.low));

                const newTrade: Trade = {
                    id: `trade-${Date.now()}`,
                    pair: TRADING_PAIR,
                    direction: tradeToOpen.direction,
                    entryPrice: latestLivePrice,
                    stopLoss: tradeToOpen.direction === 'LONG' ? low : high,
                    openedAt: new Date(),
                    status: 'active',
                    sizeUnits: 1,
                    reason: tradeToOpen.reason,
                };
                openTrades = [newTrade, ...openTrades];
                botInstance.recordTradeExecution();
                newTradeResult = newTrade;
            }
        }

        // Post update back to the main thread
        self.postMessage({
            type: 'tick_update',
            payload: {
                heatScores: newHeatScores,
                liveCandles: recentKlines.slice().reverse(),
                livePrice: latestLivePriceEntry,
                analysisEntry,
                newTrade: newTradeResult,
                dailyTradeCount: botInstance.getDailyTradeCount(),
                openTrades: openTrades
            }
        });

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        const errorData = e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) };
        self.postMessage({ type: 'log', payload: { message: `Worker tick failed: ${errorMessage}`, level: 'error', data: errorData } });
    }
};

self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'init': {
            const { apiKey, apiSecret, initialCandles } = payload;
            botInstance = new XrpUsdTrader(apiKey, apiSecret);
            botInstance.initializeBuffer(initialCandles);
            self.postMessage({ type: 'log', payload: { message: `Worker Bot initialized with ${initialCandles.length} candles.`, level: 'info' } });
            break;
        }
        case 'start': {
            if (mainInterval) clearInterval(mainInterval);
            self.postMessage({ type: 'log', payload: { message: `Worker starting analysis. Ticking every ${TICK_INTERVAL / 1000}s.`, level: 'info' } });
            runMainTick();
            mainInterval = self.setInterval(runMainTick, TICK_INTERVAL);
            self.postMessage({ type: 'status_update', payload: 'live' });
            break;
        }
        case 'stop': {
            if (mainInterval) clearInterval(mainInterval);
            mainInterval = null;
            openTrades = [];
            self.postMessage({ type: 'log', payload: { message: 'Worker stopped analysis.', level: 'info' } });
            self.postMessage({ type: 'status_update', payload: 'stopped' });
            break;
        }
    }
};

export {};
