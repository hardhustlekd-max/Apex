import {
  EngineSettings,
  FixturesQueryResponse,
  FeaturedTipsResponse,
  LiveFixturesResponse,
  LeagueOptionDTO,
} from './types.js';
import { LiveScore } from '../providers/types.js';

const DB_NAME = 'football_engine_client_cache';
const DB_VERSION = 2;
const STORE_NAME = 'cache_store';

export interface CacheEntry<T> {
  data: T;
  etag?: string;
  timestamp: number;
}

// In-memory fallback if IndexedDB is blocked or unsupported
const memoryCache = new Map<string, CacheEntry<any>>();

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

async function getFromStore<T>(key: string): Promise<CacheEntry<T> | null> {
  const mem = memoryCache.get(key);
  if (mem) return mem as CacheEntry<T>;

  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        const result = req.result as CacheEntry<T> | undefined;
        if (result && result.data !== undefined) {
          memoryCache.set(key, result);
          resolve(result);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function setToStore<T>(key: string, data: T, etag?: string): Promise<void> {
  const entry: CacheEntry<T> = {
    data,
    etag,
    timestamp: Date.now(),
  };

  memoryCache.set(key, entry);

  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(entry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export class ClientCache {
  public static async getEntry<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      return await getFromStore<T>(key);
    } catch {
      return null;
    }
  }

  public static async setEntry<T>(key: string, data: T, etag?: string): Promise<void> {
    try {
      await setToStore<T>(key, data, etag);
    } catch {}
  }

  public static async getCachedQueryResponse(key: string): Promise<CacheEntry<FixturesQueryResponse> | null> {
    return this.getEntry<FixturesQueryResponse>(key);
  }

  public static async setCachedQueryResponse(key: string, data: FixturesQueryResponse, etag?: string): Promise<void> {
    await this.setEntry<FixturesQueryResponse>(key, data, etag);
  }

  public static async getCachedFeaturedTips(): Promise<CacheEntry<FeaturedTipsResponse> | null> {
    return this.getEntry<FeaturedTipsResponse>('featured_tips');
  }

  public static async setCachedFeaturedTips(data: FeaturedTipsResponse, etag?: string): Promise<void> {
    await this.setEntry<FeaturedTipsResponse>('featured_tips', data, etag);
  }

  public static async getCachedLiveFixtures(key: string): Promise<CacheEntry<LiveFixturesResponse> | null> {
    return this.getEntry<LiveFixturesResponse>(key);
  }

  public static async setCachedLiveFixtures(key: string, data: LiveFixturesResponse, etag?: string): Promise<void> {
    await this.setEntry<LiveFixturesResponse>(key, data, etag);
  }

  public static async getCachedLiveScores(): Promise<CacheEntry<LiveScore[]> | null> {
    return this.getEntry<LiveScore[]>('live_scores');
  }

  public static async setCachedLiveScores(data: LiveScore[], etag?: string): Promise<void> {
    await this.setEntry<LiveScore[]>('live_scores', data, etag);
  }

  public static async getCachedLeagues(): Promise<CacheEntry<LeagueOptionDTO[]> | null> {
    return this.getEntry<LeagueOptionDTO[]>('leagues_catalog');
  }

  public static async setCachedLeagues(data: LeagueOptionDTO[], etag?: string): Promise<void> {
    await this.setEntry<LeagueOptionDTO[]>('leagues_catalog', data, etag);
  }

  public static async getCachedSettings(): Promise<EngineSettings | null> {
    try {
      const entry = await getFromStore<EngineSettings>('engine_settings');
      return entry?.data || null;
    } catch {
      return null;
    }
  }

  public static async setCachedSettings(settings: EngineSettings): Promise<void> {
    try {
      await setToStore<EngineSettings>('engine_settings', settings);
    } catch {}
  }

  public static async clearDynamicData(): Promise<void> {
    const keepKeys = new Set(['engine_settings', 'leagues_catalog']);
    for (const key of Array.from(memoryCache.keys())) {
      if (!keepKeys.has(key)) {
        memoryCache.delete(key);
      }
    }
    const db = await openDatabase();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();
        req.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          if (!keepKeys.has(String(cursor.key))) {
            cursor.delete();
          }
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
