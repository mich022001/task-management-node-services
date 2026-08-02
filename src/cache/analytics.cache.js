import { env } from '../config/env.js';

export class AnalyticsCache {
  constructor({
    ttlSeconds = env.CACHE_TTL_SECONDS,
    now = () => Date.now(),
  } = {}) {
    this.ttlMilliseconds = ttlSeconds * 1000;
    this.now = now;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);

      return undefined;
    }

    return structuredClone(entry.value);
  }

  set(key, value, ttlSeconds) {
    const ttlMilliseconds =
      ttlSeconds === undefined ? this.ttlMilliseconds : ttlSeconds * 1000;

    this.entries.set(key, {
      value: structuredClone(value),
      expiresAt: this.now() + ttlMilliseconds,
    });

    return structuredClone(value);
  }

  delete(key) {
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }

  size() {
    this.removeExpiredEntries();

    return this.entries.size;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  removeExpiredEntries() {
    const currentTime = this.now();

    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt <= currentTime) {
        this.entries.delete(key);
      }
    }
  }
}

export const analyticsCache = new AnalyticsCache();

export function getCachedAnalytics(key) {
  return analyticsCache.get(key);
}

export function setCachedAnalytics(key, value, ttlSeconds) {
  return analyticsCache.set(key, value, ttlSeconds);
}

export function deleteCachedAnalytics(key) {
  return analyticsCache.delete(key);
}

export function clearAnalyticsCache() {
  analyticsCache.clear();
}

export function getAnalyticsCacheSize() {
  return analyticsCache.size();
}
