// This service fetches live market data from the Binance API.
import type { PriceHistoryLogEntry } from '../types';

const PROXY_URL_PREFIX = 'https://cors.eu.org/';
const BINANCE_API_BASE_URL = 'https://api.binance.com/api/v3';

interface BinanceTicker {
    symbol: string;
    price: string;
}

type BinanceKline = [ number, string, string, string, string, string, number, string, number, string, string, string ];

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const fetchWithRetry = async (url: string, retries = 3, initialDelay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (response.status === 429 || response.status === 418) { // Rate limit
                const retryAfter = response.headers.get('Retry-After');
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : initialDelay * Math.pow(2, i);
                console.warn(`Rate limit hit. Retrying after ${waitTime / 1000}s...`);
                await delay(waitTime);
                continue;
            }
             const responseText = await response.text();
            if (!response.ok) {
                 throw new Error(`API error via proxy (${response.status}): ${responseText}`);
            }
            return JSON.parse(responseText);

        } catch (error) {
            if (i === retries - 1) throw error;
            await delay(initialDelay * Math.pow(2, i));
        }
    }
};

export const fetchLivePrices = async (pairs: string[]): Promise<Record<string, number>> => {
    const validPairs = (pairs || []).filter(p => typeof p === 'string' && p.trim().length > 0);
    if (validPairs.length === 0) return {};
    
    const symbols = validPairs.map(p => p.replace('/', ''));
    const symbolsParam = `["${symbols.join('","')}"]`;
    const targetUrl = `${BINANCE_API_BASE_URL}/ticker/price?symbols=${encodeURIComponent(symbolsParam)}`;
    const proxiedUrl = `${PROXY_URL_PREFIX}${targetUrl}`;

    try {
        const responseData = await fetchWithRetry(proxiedUrl);
        const tickers: any[] = Array.isArray(responseData) ? responseData : [responseData];
        const prices: Record<string, number> = {};
        for (const ticker of tickers) {
            if (ticker && typeof ticker.symbol === 'string' && typeof ticker.price === 'string') {
                const pair = validPairs.find(p => p.replace('/', '') === ticker.symbol);
                if (pair) prices[pair] = parseFloat(ticker.price);
            } else {
                console.warn("Received invalid ticker item:", ticker);
            }
        }
        return prices;
    } catch (error) {
        console.error("Error fetching live prices:", error);
        throw error;
    }
};

const fetchPaginatedKlines = async (symbol: string, interval: string, startTime: number, endTime: number): Promise<BinanceKline[]> => {
    let allKlines: BinanceKline[] = [];
    let currentStartTime = startTime;
    const limit = 1000;

    while (currentStartTime < endTime) {
        const params = new URLSearchParams({
            symbol,
            interval,
            startTime: currentStartTime.toString(),
            endTime: endTime.toString(),
            limit: limit.toString(),
        }).toString();
        
        const targetUrl = `${BINANCE_API_BASE_URL}/klines?${params}`;
        const proxiedUrl = `${PROXY_URL_PREFIX}${targetUrl}`;
        const klines: BinanceKline[] = await fetchWithRetry(proxiedUrl);
        
        if (klines.length === 0) break;
        
        allKlines = allKlines.concat(klines);
        currentStartTime = klines[klines.length - 1][0] + 1;
        await delay(300); // Respect API rate limits
    }
    return allKlines;
};

export const fetchHistorical1mKlines = async (pair: string, hours: number): Promise<PriceHistoryLogEntry[]> => {
    if (typeof pair !== 'string' || pair.trim().length === 0) return [];
    
    const symbol = pair.replace('/', '');
    const endTime = Date.now();
    const startTime = endTime - hours * 60 * 60 * 1000;

    const klines = await fetchPaginatedKlines(symbol, '1m', startTime, endTime);

    return klines.map(k => ({
        id: k[0],
        timestamp: new Date(k[0]),
        pair,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        interval: '1m',
    }));
};


export const fetchHistorical1sKlines = async (pair: string, hours: number): Promise<PriceHistoryLogEntry[]> => {
    if (typeof pair !== 'string' || pair.trim().length === 0) return [];
    
    const symbol = pair.replace('/', '');
    const endTime = Date.now();
    const startTime = endTime - hours * 60 * 60 * 1000;

    const klines = await fetchPaginatedKlines(symbol, '1s', startTime, endTime);

    return klines.map(k => ({
        id: k[0],
        timestamp: new Date(k[0]),
        pair,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        interval: '1s',
    }));
};


export const fetchKlinesSince = async (pair: string, interval: '1s' | '1m', startTime: number): Promise<PriceHistoryLogEntry[]> => {
    const symbol = pair.replace('/', '');
    const endTime = Date.now();
    
    if (startTime >= endTime) return [];

    const klines = await fetchPaginatedKlines(symbol, interval, startTime, endTime);

    return klines.map(k => ({
        id: k[0],
        timestamp: new Date(k[0]),
        pair,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        interval,
    }));
};
