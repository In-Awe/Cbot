import { GoogleGenAI, Type } from "@google/genai";
import type { StrategyConfig, Signal } from '../types';

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
        },
        required: ["pair", "action", "confidence", "score", "last_price", "take_profit", "stop_loss", "meta"]
    }
};

export const generateTradingSignals = async (config: StrategyConfig, apiKey: string): Promise<Signal[]> => {
    if (!apiKey) {
        throw new Error("Gemini API key is required.");
    }
    
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
        You are an advanced trading analysis engine that emulates the provided Python script.
        Based on the Python code context and the user's configuration below, generate plausible trading signals.
        The output MUST be a valid JSON array conforming to the provided schema. Do not include any explanation, comments, or markdown formatting.

        Python Code Context:
        \`\`\`python
        ${PYTHON_STRATEGY_CONTEXT}
        \`\`\`

        User Configuration:
        \`\`\`json
        ${JSON.stringify(config, null, 2)}
        \`\`\`

        Instructions:
        1.  For each trading pair in \`trading_pairs\`, generate a signal object.
        2.  Simulate realistic price data and indicator calculations (MA crosses, RSI levels) across the specified \`timeframes\` to determine the \`action\` and \`confidence\`.
        3.  Generate prices as if they are part of a continuous, plausible historical data stream to ensure realism.
        4.  The \`last_price\` should be a realistic, current-like price for the given pair (e.g., ETH/USDT should be in the thousands, MATIC/USDT around $0.5-$1.0).
        5.  Calculate \`take_profit\` and \`stop_loss\` based on \`last_price\` and the config percentages.
        6.  Populate the \`meta\` field as an array of objects. Each object must represent a timeframe and contain 'timeframe', 'signal', and 'confidence' keys.
        7.  The final aggregated 'action' should be 'buy' if the overall score is strongly positive, 'sell' if strongly negative, and 'hold' otherwise.
        8.  **Crucially, you must factor the user's \`take_profit_pct\` and \`stop_loss_pct\` into your final \`confidence\` score. A higher take-profit percentage relative to the stop-loss is riskier and should result in a lower confidence score for that signal, and vice-versa.**
        9.  Adhere strictly to the JSON schema.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.5,
            },
        });

        const jsonText = response.text.trim();
        const signals = JSON.parse(jsonText) as Signal[];

        const buys = signals.filter(s => s.action === 'buy').sort((a, b) => b.confidence - a.confidence);
        const allowedBuys = config.max_concurrent_trades;
        const allowedBuyPairs = new Set(buys.slice(0, allowedBuys).map(s => s.pair));

        return signals.map(s => {
            if (s.action === 'buy' && !allowedBuyPairs.has(s.pair)) {
                return { ...s, action: 'hold', note: 'Deferred due to max_concurrent_trades' };
            }
            return s;
        });

    } catch (e) {
        console.error("Error generating signals from Gemini API:", e);
        throw new Error("Failed to parse or receive data from Gemini API.");
    }
};