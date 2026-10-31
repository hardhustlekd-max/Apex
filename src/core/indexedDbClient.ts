import { Fixture } from './types.js';
import { LiveScore } from '../providers/types.js';

const DB_NAME = 'ApexFootballDB';
const DB_VERSION = 1;

class IndexedDBStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB not supported in this environment'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('todays_fixtures')) {
          db.createObjectStore('todays_fixtures', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('live_scores')) {
          db.createObjectStore('live_scores', { keyPath: 'fixtureId' });
        }
        if (!db.objectStoreNames.contains('app_cache')) {
          db.createObjectStore('app_cache', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  /**
   * Save Today's Fixtures to IndexedDB and LocalStorage
   */
  async saveTodaysFixtures(fixtures: Fixture[]): Promise<void> {
    if (!fixtures || fixtures.length === 0) return;

    // Save to LocalStorage fallback
    try {
      localStorage.setItem('apex_cached_todays_fixtures', JSON.stringify({
        timestamp: Date.now(),
        data: fixtures,
      }));
    } catch {
      // LocalStorage quota safe catch
    }

    // Save to IndexedDB
    try {
      const db = await this.getDB();
      const tx = db.transaction(['todays_fixtures', 'app_cache'], 'readwrite');
      const store = tx.objectStore('todays_fixtures');
      
      store.clear();
      for (const f of fixtures) {
        if (f && f.id) {
          store.put(f);
        }
      }

      const cacheStore = tx.objectStore('app_cache');
      cacheStore.put({
        key: 'todays_fixtures_meta',
        timestamp: Date.now(),
        count: fixtures.length,
      });
    } catch (err) {
      console.warn('[IndexedDB] saveTodaysFixtures note:', err);
    }
  }

  /**
   * Get Today's Fixtures from IndexedDB or LocalStorage
   */
  async getTodaysFixtures(): Promise<Fixture[] | null> {
    // 1. Try IndexedDB
    try {
      const db = await this.getDB();
      const tx = db.transaction('todays_fixtures', 'readonly');
      const store = tx.objectStore('todays_fixtures');
      
      const allRecords = await new Promise<Fixture[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

      if (allRecords && allRecords.length > 0) {
        return allRecords;
      }
    } catch {
      // fallback to localStorage
    }

    // 2. LocalStorage fallback
    try {
      const raw = localStorage.getItem('apex_cached_todays_fixtures');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          return parsed.data;
        }
      }
    } catch {
      // fallback
    }

    return null;
  }

  /**
   * Save Live Scores to IndexedDB and LocalStorage
   */
  async saveLiveScores(scores: LiveScore[]): Promise<void> {
    if (!scores) return;

    try {
      localStorage.setItem('apex_cached_live_scores', JSON.stringify({
        timestamp: Date.now(),
        data: scores,
      }));
    } catch {}

    try {
      const db = await this.getDB();
      const tx = db.transaction(['live_scores', 'app_cache'], 'readwrite');
      const store = tx.objectStore('live_scores');
      
      store.clear();
      for (const s of scores) {
        if (s && s.fixtureId) {
          store.put(s);
        }
      }

      tx.objectStore('app_cache').put({
        key: 'live_scores_meta',
        timestamp: Date.now(),
        count: scores.length,
      });
    } catch (err) {
      console.warn('[IndexedDB] saveLiveScores note:', err);
    }
  }

  /**
   * Get Live Scores from IndexedDB or LocalStorage
   */
  async getLiveScores(): Promise<LiveScore[] | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('live_scores', 'readonly');
      const store = tx.objectStore('live_scores');
      
      const records = await new Promise<LiveScore[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

      if (records && records.length > 0) {
        return records;
      }
    } catch {}

    try {
      const raw = localStorage.getItem('apex_cached_live_scores');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.data)) {
          return parsed.data;
        }
      }
    } catch {}

    return null;
  }
}

export const indexedDbClient = new IndexedDBStorage();
