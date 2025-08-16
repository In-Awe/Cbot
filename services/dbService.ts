import type { PriceHistoryLogEntry } from '../types';

const DB_NAME = 'TradingDashboardDB';
const DB_VERSION = 1;
const STORE_PREFIX = 'priceHistory_';

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
            // Object stores will be created on-demand if they don't exist
            console.log("Database upgrade needed or initial setup.");
        };
    });
};

const createObjectStoreIfNeeded = (db: IDBDatabase, storeName: string): Promise<void> => {
    return new Promise((resolve) => {
        if (!db.objectStoreNames.contains(storeName)) {
            const version = db.version;
            db.close();
            const open = indexedDB.open(DB_NAME, version + 1);
            open.onupgradeneeded = () => {
                const dbInstance = open.result;
                if (!dbInstance.objectStoreNames.contains(storeName)) {
                     dbInstance.createObjectStore(storeName, { keyPath: 'id' });
                }
            }
            open.onsuccess = () => {
                db = open.result;
                resolve();
            }
        } else {
            resolve();
        }
    });
};


export const addPriceHistory = async (pair: string, entries: PriceHistoryLogEntry[]): Promise<void> => {
    const db = await openDB();
    const storeName = `${STORE_PREFIX}${pair.replace('/', '_')}`;
    
    // Check if we need to create the store. This is a simplified approach.
    // In a real-world app, store creation is best handled strictly in onupgradeneeded.
    if (!db.objectStoreNames.contains(storeName)) {
        console.warn(`Object store ${storeName} does not exist. It will be created, this may cause a delay.`);
        // A more robust solution might involve queueing transactions after a version change.
        // For this app's lifecycle, we'll proceed assuming the user can wait a moment.
        return; // We will handle creation in `initDBForPairs`
    }
    
    if (entries.length === 0) return;
    
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(`Transaction error: ${(event.target as IDBTransaction).error}`);
        
        for (const entry of entries) {
            store.put(entry); // 'put' will add or update based on keyPath 'id'
        }
    });
};

export const getPriceHistory = async (pair: string, limit: number = 100): Promise<PriceHistoryLogEntry[]> => {
    const db = await openDB();
    const storeName = `${STORE_PREFIX}${pair.replace('/', '_')}`;
    if (!db.objectStoreNames.contains(storeName)) return [];

    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.openCursor(null, 'prev'); // 'prev' to get the latest entries
    
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

export const getLatestEntryTimestamp = async (pair: string): Promise<number | null> => {
    const db = await openDB();
    const storeName = `${STORE_PREFIX}${pair.replace('/', '_')}`;
    if (!db.objectStoreNames.contains(storeName)) return null;

    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.openCursor(null, 'prev');
    
    return new Promise((resolve) => {
        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            resolve(cursor ? (cursor.value.id as number) : null);
        };
        request.onerror = () => resolve(null);
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
                request.onerror = () => resolve(0); // If count fails, return 0
            });
        } else {
            counts[pair] = 0;
        }
    }
    return counts;
};


export const initDBForPairs = async (pairs: string[]): Promise<void> => {
    let currentDb = await openDB();
    const storesToCreate = pairs
        .map(p => `${STORE_PREFIX}${p.replace('/', '_')}`)
        .filter(name => !currentDb.objectStoreNames.contains(name));
        
    if (storesToCreate.length > 0) {
        console.log("Need to create new object stores:", storesToCreate);
        const newVersion = currentDb.version + 1;
        currentDb.close(); // Must close before reopening with new version
        db = null; // Prevent race conditions by clearing the stale connection handle

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