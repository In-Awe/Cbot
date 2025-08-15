// This service fetches live market data from the Binance API.

// NOTE: Direct browser-to-API calls to Binance are blocked by CORS policies.
// To resolve this for development, we use a public CORS proxy.
// Switched proxy to resolve 403 Forbidden errors.
const PROXY_URL_PREFIX = 'https://cors.eu.org/';
const BINANCE_API_BASE_URL = 'https://api.binance.com/api/v3';

interface BinanceTicker {
    symbol: string;
    price: string;
}

/**
 * Fetches the live prices for a list of trading pairs from the Binance API.
 * @param pairs - An array of trading pair strings (e.g., ["ETH/USDT", "BTC/USDT"]).
 * @param apiKey - The Binance API key (currently unused for this public endpoint via proxy but kept for future-proofing).
 * @returns A record mapping each pair to its latest price.
 */
export const fetchLivePrices = async (
    pairs: string[],
    apiKey: string
): Promise<Record<string, number>> => {
    // The Binance API expects symbols without slashes, e.g., "ETHUSDT"
    const symbols = pairs.map(p => p.replace('/', ''));
    if (symbols.length === 0) {
        return {};
    }
    const symbolsParam = `["${symbols.join('","')}"]`;
    
    // The full Binance API endpoint URL
    const targetUrl = `${BINANCE_API_BASE_URL}/ticker/price?symbols=${encodeURIComponent(symbolsParam)}`;
    
    // The final URL for the proxy. This proxy simply prepends its URL.
    const proxiedUrl = `${PROXY_URL_PREFIX}${targetUrl}`;

    try {
        // The proxy does not forward custom headers like X-MBX-APIKEY.
        // Fortunately, the /ticker/price endpoint is public and does not require an API key.
        const response = await fetch(proxiedUrl);
        
        // Read the body ONCE as text to avoid "body stream already read" errors.
        const responseText = await response.text();

        if (!response.ok) {
            let errorMessage;
            try {
                 // Try to parse the text as JSON, which is what Binance usually sends for errors
                const errorData = JSON.parse(responseText);
                errorMessage = errorData.msg || 'Failed to fetch prices';
            } catch (jsonError) {
                // If parsing fails, the raw text from the proxy/API is the error.
                errorMessage = responseText;
            }
            throw new Error(`API error via proxy (${response.status}): ${errorMessage}`);
        }

        const responseData = JSON.parse(responseText);
        
        // The API can return a single object or an array. Also, a proxy error might return a non-iterable object.
        // This makes the code robust by ensuring we always iterate over an array.
        const tickers: any[] = Array.isArray(responseData) ? responseData : [responseData];

        const prices: Record<string, number> = {};
        for (const ticker of tickers) {
            // Defensively check for the expected properties to avoid errors from unexpected response structures.
            if (ticker && typeof ticker.symbol === 'string' && typeof ticker.price === 'string') {
                // Convert symbol back to "PAIR/BASE" format
                const pair = pairs.find(p => p.replace('/', '') === ticker.symbol);
                if (pair) {
                    prices[pair] = parseFloat(ticker.price);
                }
            } else {
                console.warn("Received invalid or unexpected data item from Binance API/proxy:", ticker);
            }
        }
        
        // Check if any pairs were not returned by the API
        for (const pair of pairs) {
            if (!prices[pair]) {
                console.warn(`Price for ${pair} not found in Binance response.`);
            }
        }

        return prices;
    } catch (error) {
        console.error("Error fetching from Binance API:", error);
        throw error;
    }
};