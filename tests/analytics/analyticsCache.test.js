import {
  AnalyticsCache,
  analyticsCache,
  clearAnalyticsCache,
  deleteCachedAnalytics,
  getAnalyticsCacheSize,
  getCachedAnalytics,
  setCachedAnalytics,
} from '../../src/cache/analytics.cache.js';

describe('Analytics cache', () => {
  afterEach(() => {
    clearAnalyticsCache();
  });

  test('stores and retrieves analytics values', () => {
    const value = {
      total_tasks: 10,
    };

    setCachedAnalytics('analytics:test', value);

    expect(getCachedAnalytics('analytics:test')).toEqual(value);
  });

  test('returns undefined for a missing key', () => {
    expect(getCachedAnalytics('analytics:missing')).toBeUndefined();
  });

  test('returns cloned values that cannot mutate the cached value', () => {
    const value = {
      summary: {
        total_tasks: 10,
      },
    };

    setCachedAnalytics('analytics:clone', value);

    const retrieved = getCachedAnalytics('analytics:clone');
    retrieved.summary.total_tasks = 100;

    expect(getCachedAnalytics('analytics:clone')).toEqual({
      summary: {
        total_tasks: 10,
      },
    });
  });

  test('expires a value after its TTL', () => {
    let currentTime = 1_000;

    const cache = new AnalyticsCache({
      ttlSeconds: 3600,
      now: () => currentTime,
    });

    cache.set('analytics:summary', {
      total_tasks: 5,
    });

    currentTime += 3_599_000;

    expect(cache.get('analytics:summary')).toEqual({
      total_tasks: 5,
    });

    currentTime += 1_000;

    expect(cache.get('analytics:summary')).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  test('supports a custom TTL when setting a value', () => {
    let currentTime = 1_000;

    const cache = new AnalyticsCache({
      ttlSeconds: 3600,
      now: () => currentTime,
    });

    cache.set(
      'analytics:short-lived',
      {
        total_tasks: 2,
      },
      10,
    );

    currentTime += 9_999;

    expect(cache.get('analytics:short-lived')).toEqual({
      total_tasks: 2,
    });

    currentTime += 1;

    expect(cache.get('analytics:short-lived')).toBeUndefined();
  });

  test('deletes one cached value', () => {
    setCachedAnalytics('analytics:first', {
      value: 1,
    });

    setCachedAnalytics('analytics:second', {
      value: 2,
    });

    expect(deleteCachedAnalytics('analytics:first')).toBe(true);
    expect(getCachedAnalytics('analytics:first')).toBeUndefined();
    expect(getCachedAnalytics('analytics:second')).toEqual({
      value: 2,
    });
  });

  test('returns false when deleting a missing key', () => {
    expect(deleteCachedAnalytics('analytics:missing')).toBe(false);
  });

  test('clears every cached value', () => {
    setCachedAnalytics('analytics:first', {
      value: 1,
    });

    setCachedAnalytics('analytics:second', {
      value: 2,
    });

    clearAnalyticsCache();

    expect(getAnalyticsCacheSize()).toBe(0);
    expect(getCachedAnalytics('analytics:first')).toBeUndefined();
    expect(getCachedAnalytics('analytics:second')).toBeUndefined();
  });

  test('reports the number of active entries', () => {
    expect(getAnalyticsCacheSize()).toBe(0);

    setCachedAnalytics('analytics:first', {
      value: 1,
    });

    setCachedAnalytics('analytics:second', {
      value: 2,
    });

    expect(getAnalyticsCacheSize()).toBe(2);
  });

  test('removes expired values when calculating cache size', () => {
    let currentTime = 1_000;

    const cache = new AnalyticsCache({
      ttlSeconds: 5,
      now: () => currentTime,
    });

    cache.set('analytics:first', {
      value: 1,
    });

    cache.set('analytics:second', {
      value: 2,
    });

    currentTime += 5_000;

    expect(cache.size()).toBe(0);
  });

  test('supports checking whether an active key exists', () => {
    analyticsCache.set('analytics:exists', {
      value: true,
    });

    expect(analyticsCache.has('analytics:exists')).toBe(true);
    expect(analyticsCache.has('analytics:missing')).toBe(false);
  });
});
