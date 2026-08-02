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
    const removedEntries = this.entries.size;

    this.entries.clear();

    return removedEntries;
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
    let removedEntries = 0;

    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt <= currentTime) {
        this.entries.delete(key);
        removedEntries += 1;
      }
    }

    return removedEntries;
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
  return analyticsCache.clear();
}

export function removeExpiredAnalyticsCacheEntries() {
  return analyticsCache.removeExpiredEntries();
}

export function getAnalyticsCacheSize() {
  return analyticsCache.size();
}
