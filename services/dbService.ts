import type { PriceHistoryLogEntry, Trade } from '../types';

const DB_NAME = 'TradingDashboardDB';
const DB_VERSION = 2; // Incremented version to trigger onupgradeneeded for new store
const STORE_PREFIX = 'priceHistory_';
const TRADES_STORE_NAME = 'trades';

let db: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Database error:", (event.target as IDBOpenDBRequest).error);
            reject("Error opening database");
        };

        request.onsuccess = (event) => {
            db = (event.target as IDBOpenDBRequest).result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const dbInstance = (event.target as IDBOpenDBRequest).result;
            // Create trades store if it doesn't exist
            if (!dbInstance.objectStoreNames.contains(TRADES_STORE_NAME)) {
                dbInstance.createObjectStore(TRADES_STORE_NAME, { keyPath: 'id' });
                console.log(`Object store ${TRADES_STORE_NAME} created.`);
            }
        };
    });
};


export const addPriceHistory = async (pair: string, entries: PriceHistoryLogEntry[]): Promise<void> => {
    const db = await openDB();
    const storeName = `${STORE_PREFIX}${pair.replace('/', '_')}`;
    
    if (!db.objectStoreNames.contains(storeName)) {
        console.warn(`Object store ${storeName} does not exist. It must be created via initDB first.`);
        return;
    }
    
    if (entries.length === 0) return;
    
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(`Transaction error: ${(event.target as IDBTransaction).error}`);
        
        for (const entry of entries) {
            store.put(entry);
        }
    });
};

export const addOrUpdateTrades = async (trades: Trade[]): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(TRADES_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(TRADES_STORE_NAME);

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(`Transaction error: ${(event.target as IDBTransaction).error}`);
        for (const trade of trades) {
            store.put(trade);
        }
    });
};

export const getTrades = async (): Promise<Trade[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(TRADES_STORE_NAME)) return [];

    const transaction = db.transaction(TRADES_STORE_NAME, 'readonly');
    const store = transaction.objectStore(TRADES_STORE_NAME);
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            // Ensure dates are properly deserialized
            const trades = (request.result as any[]).map(t => ({
                ...t,
                openedAt: new Date(t.openedAt),
                closedAt: t.closedAt ? new Date(t.closedAt) : undefined,
            }));
            resolve(trades as Trade[]);
        };
        request.onerror = () => reject(request.error);
    });
};


export const getPriceHistory = async (pair: string, limit: number = 100): Promise<PriceHistoryLogEntry[]> => {
    const db = await openDB();
    const storeName = `${STORE_PREFIX}${pair.replace('/', '_')}`;
    if (!db.objectStoreNames.contains(storeName)) return [];

    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.openCursor(null, 'prev');
    
    const entries: PriceHistoryLogEntry[] = [];

    return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor && entries.length < limit) {
                entries.push(cursor.value);
                cursor.continue();
            } else {
                resolve(entries);
            }
        };
        request.onerror = (event) => reject(`Cursor error: ${(event.target as IDBRequest).error}`);
    });
};

export const getFullPriceHistory = async (pair: string, interval?: '1m' | '15s'): Promise<PriceHistoryLogEntry[]> => {
    const db = await openDB();
    const storeName = `${STORE_PREFIX}${pair.replace('/', '_')}`;
    if (!db.objectStoreNames.contains(storeName)) return [];
    
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            const result = request.result;
            const filtered = interval ? result.filter(r => r.interval === interval) : result;
            resolve(filtered.sort((a,b) => b.id - a.id));
        };
        request.onerror = () => reject(request.error);
    });
};

export const getHistoryCounts = async (pairs: string[]): Promise<Record<string, number>> => {
    const db = await openDB();
    const counts: Record<string, number> = {};
    
    for (const pair of pairs) {
        const storeName = `${STORE_PREFIX}${pair.replace('/', '_')}`;
        if (db.objectStoreNames.contains(storeName)) {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();
            counts[pair] = await new Promise<number>(resolve => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(0);
            });
        } else {
            counts[pair] = 0;
        }
    }
    return counts;
};


export const initDB = async (pairs: string[]): Promise<void> => {
    let currentDb = await openDB();
    const storesToCreate = pairs
        .map(p => `${STORE_PREFIX}${p.replace('/', '_')}`)
        .filter(name => !currentDb.objectStoreNames.contains(name));
        
    if (!currentDb.objectStoreNames.contains(TRADES_STORE_NAME)) {
        if (!storesToCreate.includes(TRADES_STORE_NAME)) {
            storesToCreate.push(TRADES_STORE_NAME);
        }
    }
        
    if (storesToCreate.length > 0) {
        console.log("Need to create new object stores:", storesToCreate);
        const newVersion = currentDb.version + 1;
        currentDb.close(); 
        db = null;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, newVersion);
            request.onupgradeneeded = (event) => {
                const dbInstance = (event.target as IDBOpenDBRequest).result;
                storesToCreate.forEach(storeName => {
                    if (!dbInstance.objectStoreNames.contains(storeName)) {
                        dbInstance.createObjectStore(storeName, { keyPath: 'id' });
                        console.log(`Object store ${storeName} created.`);
                    }
                });
            };
            request.onsuccess = (event) => {
                db = (event.target as IDBOpenDBRequest).result;
                console.log("DB upgraded and new stores created.");
                resolve();
            };
            request.onerror = (event) => {
                console.error("DB upgrade error:", (event.target as IDBOpenDBRequest).error);
                reject("Error upgrading DB");
            };
        });
    }
};