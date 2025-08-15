
import { GoogleGenAI, Type } from "@google/genai";
import type { StrategyConfig, Signal, Trade } from '../types';

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
    
    # The logic below is a simplified representation of how signals are generated.
    # The key is the multi-timeframe analysis combining Moving Averages and RSI.
    def analyze_pair(self, pair: str) -> Dict[str, Any]:
        # This is a placeholder for the complex analysis logic.
        # In the real script, it would fetch data, compute indicators, and evaluate.
        # The AI should simulate this process.
        results = {}
        # ... logic to produce a result dictionary ...
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
        required: ["pair", "action", "confidence", "score", "last_price", "take_profit", "stop_loss", "meta"]
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
            if (attempt >= retries) {
                throw error;
            }
            const errorString = String(error);
            const isRateLimitError = errorString.includes("429") || errorString.toLowerCase().includes("quota");
            
            // Exponential backoff
            const backoff = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
            
            // Use a much longer delay for rate limit errors
            const waitTime = isRateLimitError ? Math.max(backoff, 5000) : backoff;

            console.warn(
                `${isRateLimitError ? 'Rate limit exceeded' : 'API call failed'}. ` +
                `Retrying in ${Math.round(waitTime / 1000)}s... (Attempt ${attempt}/${retries})`
            );
            await delay(waitTime);
        }
    }
};

export const generateTradingSignals = async (config: StrategyConfig, apiKey: string, tradeHistory: Trade[]): Promise<Signal[]> => {
    if (!apiKey) {
        throw new Error("Gemini API key is required.");
    }
    
    const ai = new GoogleGenAI({ apiKey });

    const summarizedHistory = tradeHistory
        .slice(0, 50) // Take last 50 trades
        .map(t => ({
            pair: t.pair,
            direction: t.direction,
            outcome: t.pnl && t.pnl > 0 ? 'WIN' : t.pnl && t.pnl < 0 ? 'LOSS' : 'BREAK_EVEN',
            pnl_usd: t.pnl?.toFixed(2),
            initial_confidence: t.initialConfidence?.toFixed(2),
            trigger_signals: t.initialSignalMeta
                ?.filter(m => m.signal === 'bull' || m.signal === 'bear')
                .map(m => `${m.timeframe}:${m.signal}`)
                .join(', ')
        }));

    const prompt = `
        You are an advanced, self-improving trading analysis engine. Your primary goal is to generate profitable trading signals by learning from your past performance.
        You emulate the provided Python script but with a crucial feedback loop.

        Python Code Context (Your fundamental strategy):
        \`\`\`python
        ${PYTHON_STRATEGY_CONTEXT}
        \`\`\`

        User Configuration:
        \`\`\`json
        ${JSON.stringify(config, null, 2)}
        \`\`\`

        Trade History (Your recent performance, learn from this):
        \`\`\`json
        ${JSON.stringify(summarizedHistory, null, 2)}
        \`\`\`

        **Core Instructions & Feedback Loop:**
        1.  **Analyze Your History:** Carefully review the provided \`Trade History\`. Identify patterns. Are high-confidence signals for certain pairs consistently failing? Are specific timeframe combinations (e.g., '1h:bull' with '5m:bull') leading to wins?
        2.  **Adapt and Calibrate:** Based on your analysis, you MUST adjust your internal strategy. If your past 'buy' signals with >80% confidence for MATIC/USDT have been losing, you must lower your confidence for similar signals in the future or even issue a 'hold'. Conversely, if a pattern is consistently profitable, increase your confidence when you see it again.
        2.5. **Optimize Risk Parameters:** Based on your analysis of volatility and past performance for a specific pair, if you determine the user's configured Take Profit or Stop Loss percentages are suboptimal, you may suggest improved values in the 'suggested_take_profit_pct' and 'suggested_stop_loss_pct' fields. Only provide suggestions if you have high confidence that they will improve profitability.
        3.  **Generate New Signals:** For each pair in the user's \`trading_pairs\`, generate a new signal object based on your adapted strategy.
        4.  **Simulate Realism:** Generate plausible, continuous price data. The \`last_price\` must be realistic for each pair.
        5.  **Calculate Risk:** Calculate \`take_profit\` and \`stop_loss\` based on \`last_price\` and the config percentages.
        6.  **Provide Detailed Rationale:** Populate the \`meta\` field with your analysis for each timeframe.
        7.  **Factor in Risk/Reward:** Your final \`confidence\` score must reflect the risk/reward ratio from \`take_profit_pct\` and \`stop_loss_pct\`. A wider stop-loss should decrease confidence.
        8.  **Output JSON Only:** The final output must be ONLY a valid JSON array conforming to the schema. No explanations.
    `;

    const generate = () => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.5,
        },
    });

    try {
        const response = await withRetry(generate);

        const jsonText = response.text.trim();
        const signals = JSON.parse(jsonText) as Signal[];

        // This logic is a safeguard, but primary control should be via open trade checks in App.tsx
        const buys = signals.filter(s => s.action === 'buy').sort((a, b) => b.confidence - a.confidence);
        const allowedBuys = config.max_concurrent_trades;
        const allowedBuyPairs = new Set(buys.slice(0, allowedBuys).map(s => s.pair));

        return signals.map(s => {
            if (s.action === 'buy' && !allowedBuyPairs.has(s.pair)) {
                return { ...s, action: 'hold', note: 'Deferred due to max_concurrent_trades limit' };
            }
            return s;
        });

    } catch (e) {
        console.error("Error generating signals from Gemini API after retries:", e);
        if (e instanceof Error) {
            throw e;
        }
        throw new Error("Failed to parse or receive data from Gemini API.");
    }
};
