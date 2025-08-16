import { GoogleGenAI, Type } from "@google/genai";
import type { StrategyConfig, Signal, Trade, PriceHistoryLogEntry } from '../types';

const PYTHON_STRATEGY_CONTEXT = `
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import numpy as np
import pandas as pd
import time

@dataclass
class StrategyConfig:
    exchange: str = "Binance"
    trading_pairs: List[str] = field(default_factory=lambda: ["ZORA/USDT", "MATIC/USDT", "LINK/USDT", "ARB/USDT", "ETH/USDT"])
    trade_amount_usd: float = 20.0
    max_concurrent_trades: int = 2
    take_profit_pct: float = 3.0
    stop_loss_pct: float = 1.5
    entry_window_s: int = 30
    exit_timeout_s: int = 600
    timeframes: List[str] = field(default_factory=lambda: ["1m", "5m", "15m", "1h", "4h", "1d"])
    short_ma: int = 20
    long_ma: int = 50
    rsi_period: int = 14

class BasicStrategyV2:
    def __init__(self, config: StrategyConfig):
        self.config = config
    
    def analyze_pair(self, pair: str) -> Dict[str, Any]:
        results = {}
        return results

    def generate_signals(self) -> List[Dict[str, Any]]:
        signals = []
        for pair in self.config.trading_pairs:
            sig = self.analyze_pair(pair)
            signals.append(sig)
        return signals
`;

const responseSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            pair: { type: Type.STRING },
            action: { type: Type.STRING, enum: ['buy', 'sell', 'hold'] },
            confidence: { type: Type.NUMBER },
            score: { type: Type.NUMBER },
            last_price: { type: Type.NUMBER, nullable: true },
            take_profit: { type: Type.NUMBER, nullable: true },
            stop_loss: { type: Type.NUMBER, nullable: true },
            meta: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        timeframe: { type: Type.STRING },
                        signal: { type: Type.STRING, enum: ['bull', 'bear', 'neutral', 'error'] },
                        confidence: { type: Type.NUMBER },
                        error: { type: Type.STRING, nullable: true },
                    },
                    required: ["timeframe", "signal", "confidence"]
                }
            },
            note: { type: Type.STRING, nullable: true },
            suggested_take_profit_pct: { type: Type.NUMBER, nullable: true },
            suggested_stop_loss_pct: { type: Type.NUMBER, nullable: true },
        },
        required: ["pair", "action", "confidence", "score", "meta"]
    }
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, initialDelay = 1000): Promise<T> => {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (error) {
            attempt++;
            if (attempt >= retries) throw error;
            const errorString = String(error);
            const isRateLimitError = errorString.includes("429") || errorString.toLowerCase().includes("quota");
            const backoff = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
            const waitTime = isRateLimitError ? Math.max(backoff, 5000) : backoff;
            console.warn(`API call failed (Attempt ${attempt}/${retries}). Retrying in ${Math.round(waitTime / 1000)}s...`);
            await delay(waitTime);
        }
    }
};

const summarizePriceHistory = (history: PriceHistoryLogEntry[]) => {
    if (history.length === 0) return null;

    const data1m = history.filter(d => d.interval === '1m');
    const data15s = history.filter(d => d.interval === '15s');

    const getStats = (data: PriceHistoryLogEntry[]) => {
        if (data.length === 0) return null;
        const prices = data.map(d => d.close);
        const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
        const stdDev = Math.sqrt(returns.map(r => Math.pow(r - (returns.reduce((a,b) => a+b, 0) / returns.length), 2)).reduce((a,b) => a+b, 0) / returns.length);
        
        return {
            records: data.length,
            startTime: new Date(data[data.length - 1].timestamp).toISOString(),
            endTime: new Date(data[0].timestamp).toISOString(),
            low: Math.min(...prices),
            high: Math.max(...prices),
            avgVolume: data.map(d=>d.volume).reduce((a,b)=>a+b, 0) / data.length,
            volatility: stdDev * Math.sqrt(data.length) // Simplified annualized volatility estimate
        };
    };

    return {
        '1m_summary': getStats(data1m),
        '15s_summary': getStats(data15s),
    };
};

export const constructGeminiPrompt = (
    config: StrategyConfig,
    tradeHistory: Trade[],
    livePrices: Record<string, number> | null,
    priceHistory: Record<string, PriceHistoryLogEntry[]>
): string => {
     const summarizedHistory = tradeHistory
        .slice(0, 50)
        .map(t => ({
            pair: t.pair,
            direction: t.direction,
            outcome: t.pnl && t.pnl > 0 ? 'WIN' : t.pnl && t.pnl < 0 ? 'LOSS' : 'BREAK_EVEN',
            pnl_usd: t.pnl?.toFixed(2),
        }));

    const fullHistorySummary: Record<string, any> = {};
    const recentHistoryForPrompt: Record<string, any> = {};

    for(const pair of config.trading_pairs) {
        const history = priceHistory[pair] || [];
        fullHistorySummary[pair] = summarizePriceHistory(history);
        
        // Get the most recent 15s data (last 90 minutes = 360 records of 15s data)
        const sorted15s = history.filter(d => d.interval === '15s').sort((a,b) => b.id - a.id);
        recentHistoryForPrompt[pair] = sorted15s.slice(0, 360).sort((a,b) => a.id - b.id).map(entry => ({
            t: new Date(entry.timestamp).toISOString(),
            o: entry.open?.toFixed(4), h: entry.high?.toFixed(4),
            l: entry.low?.toFixed(4), c: entry.close.toFixed(4), v: entry.volume?.toFixed(2),
        }));
    }

    return `
        You are an expert quantitative analyst and an advanced, self-improving trading analysis engine. Your primary goal is to generate profitable trading signals by analyzing provided data and learning from past performance. Your main objective is to predict price movement within the next 3-5 minutes.

        **CRITICAL INSTRUCTION: You are in a closed-loop environment. You CANNOT access external data or APIs. Your entire analysis and all signal generation MUST be based *exclusively* on the data provided in this prompt. Treat this data as the absolute and only source of truth.**

        **Python Code Context (This defines your operational framework):**
        \`\`\`python
        ${PYTHON_STRATEGY_CONTEXT}
        \`\`\`

        User Configuration:
        \`\`\`json
        ${JSON.stringify(config, null, 2)}
        \`\`\`

        Live Market Prices (This is the most current, real-time data to be used):
        \`\`\`json
        ${JSON.stringify(livePrices, null, 2)}
        \`\`\`

        Historical Data Summary (Statistical overview of long-term market conditions):
        \`\`\`json
        ${JSON.stringify(fullHistorySummary, null, 2)}
        \`\`\`

        Recent High-Resolution Price History (Last ~90 minutes of 15-second candles for tactical analysis. 'o,h,l,c,v' is open, high, low, close, volume.):
        \`\`\`json
        ${JSON.stringify(recentHistoryForPrompt, null, 2)}
        \`\`\`

        Trade History (Your recent performance; you MUST learn from these results):
        \`\`\`json
        ${JSON.stringify(summarizedHistory, null, 2)}
        \`\`\`

        **Advanced Analysis Techniques for 3-5 Minute Predictions:**
        1.  **Primary Focus on Tactical Data:** Your most important data is the \`Recent High-Resolution Price History\`. Analyze it for micro-trends, momentum shifts, and volume spikes that indicate a potential move in the next 3-5 minutes.
        2.  **Use Strategic Context:** Use the \`Historical Data Summary\` to understand if the market is generally volatile or stable. A strong tactical signal is more reliable in a stable, trending market.
        3.  **Patience and High Conviction:** Do not force a trade. If a clear, high-probability setup for a 3-5 minute move is not present, your primary action should be 'hold'. A 'buy' or 'sell' signal should only be issued when you have high conviction based on the tactical data.

        **Core Instructions & Feedback Loop:**
        1.  **Data Primacy**: Your entire analysis for each trading pair MUST originate from the JSON data blocks provided above.
        2.  **Analyze Trade History:** Correlate wins and losses with the market regime you can infer from the historical summary and patterns from the recent history. Your new signals must reflect these learnings.
        3.  **Adapt Your Strategy:** Based on your analysis, calibrate your internal logic. If past 'buy' signals failed during high volatility (seen in summary), be more cautious now. This adaptation is mandatory.
        4.  **Optimize Risk Parameters:** You may suggest improved values for 'take_profit_pct' and 'stop_loss_pct' if you have high confidence they will improve profitability.
        5.  **Generate Signals:** For each pair in the user's \`trading_pairs\`, generate a new signal object based on your adapted strategy.
        6.  **Calculate TP/SL:** Calculate the final \`take_profit\` and \`stop_loss\` price levels using the provided \`last_price\` from the "Live Market Prices" data and the config percentages.
        7.  **Provide Rationale:** Populate the \`meta\` field with your analysis for each timeframe. The \`last_price\` in your response for each signal MUST EXACTLY MATCH the price from the "Live Market Prices" data.
        8.  **Output JSON Only:** The final output must be ONLY a valid JSON array conforming to the schema. No commentary or explanations outside the JSON structure.
    `;
};

export const generateTradingSignals = async (
    config: StrategyConfig, 
    apiKey: string, 
    tradeHistory: Trade[],
    livePrices: Record<string, number> | null,
    priceHistory: Record<string, PriceHistoryLogEntry[]>
): Promise<Signal[]> => {
    if (!apiKey) throw new Error("Gemini API key is required.");
    
    const ai = new GoogleGenAI({ apiKey });
    const prompt = constructGeminiPrompt(config, tradeHistory, livePrices, priceHistory);

    const generate = () => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.4,
        },
    });

    try {
        const response = await withRetry(generate);
        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as Signal[];
    } catch (e) {
        console.error("Error generating signals from Gemini API:", e);
        if (e instanceof Error) throw e;
        throw new Error("Failed to parse or receive data from Gemini API.");
    }
};
