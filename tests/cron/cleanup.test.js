import { jest } from '@jest/globals';

import { runCleanup } from '../../src/cron/cleanup.job.js';

function createLogger() {
  return {
    info: jest.fn(),
  };
}

function createReminderRegistry({ removedEntries = 0 } = {}) {
  return {
    removeOlderThan: jest.fn().mockReturnValue(removedEntries),
  };
}

describe('Cleanup job', () => {
  test('removes expired cache entries, finished jobs, and old reminders', async () => {
    const removeExpiredAnalyticsCacheEntriesFn = jest.fn().mockReturnValue(3);

    const removeFinishedNotificationJobsFn = jest.fn().mockReturnValue(4);

    const reminderRegistry = createReminderRegistry({
      removedEntries: 2,
    });

    const now = new Date('2026-08-10T00:00:00.000Z');

    const result = await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn,
      removeFinishedNotificationJobsFn,
      reminderRegistry,
      loggerInstance: createLogger(),
      now,
    });

    expect(result).toEqual({
      executed_at: '2026-08-10T00:00:00.000Z',

      retention: {
        notification_jobs_days: 7,
        reminder_entries_days: 2,
      },

      removed: {
        analytics_cache_entries: 3,
        notification_jobs: 4,
        reminder_entries: 2,
        total: 9,
      },
    });
  });

  test('uses the expected notification retention cutoff', async () => {
    const removeFinishedNotificationJobsFn = jest.fn().mockReturnValue(0);

    await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(0),

      removeFinishedNotificationJobsFn,

      reminderRegistry: createReminderRegistry(),

      loggerInstance: createLogger(),

      now: new Date('2026-08-10T00:00:00.000Z'),

      notificationRetentionDays: 7,
    });

    expect(removeFinishedNotificationJobsFn).toHaveBeenCalledWith({
      olderThan: new Date('2026-08-03T00:00:00.000Z'),
    });
  });

  test('uses the expected reminder retention cutoff', async () => {
    const reminderRegistry = createReminderRegistry();

    await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(0),

      removeFinishedNotificationJobsFn: jest.fn().mockReturnValue(0),

      reminderRegistry,
      loggerInstance: createLogger(),

      now: new Date('2026-08-10T00:00:00.000Z'),

      reminderRetentionDays: 2,
    });

    expect(reminderRegistry.removeOlderThan).toHaveBeenCalledWith(
      new Date('2026-08-08T00:00:00.000Z'),
    );
  });

  test('supports custom retention periods', async () => {
    const removeFinishedNotificationJobsFn = jest.fn().mockReturnValue(1);

    const reminderRegistry = createReminderRegistry({
      removedEntries: 1,
    });

    const result = await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(1),

      removeFinishedNotificationJobsFn,
      reminderRegistry,
      loggerInstance: createLogger(),

      now: new Date('2026-08-10T00:00:00.000Z'),

      notificationRetentionDays: 14,
      reminderRetentionDays: 5,
    });

    expect(result.retention).toEqual({
      notification_jobs_days: 14,
      reminder_entries_days: 5,
    });

    expect(removeFinishedNotificationJobsFn).toHaveBeenCalledWith({
      olderThan: new Date('2026-07-27T00:00:00.000Z'),
    });

    expect(reminderRegistry.removeOlderThan).toHaveBeenCalledWith(
      new Date('2026-08-05T00:00:00.000Z'),
    );
  });

  test('returns zero counts when nothing is removed', async () => {
    const result = await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(0),

      removeFinishedNotificationJobsFn: jest.fn().mockReturnValue(0),

      reminderRegistry: createReminderRegistry(),

      loggerInstance: createLogger(),

      now: new Date('2026-08-10T00:00:00.000Z'),
    });

    expect(result.removed).toEqual({
      analytics_cache_entries: 0,
      notification_jobs: 0,
      reminder_entries: 0,
      total: 0,
    });
  });

  test('logs cleanup statistics', async () => {
    const loggerInstance = createLogger();

    const result = await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(1),

      removeFinishedNotificationJobsFn: jest.fn().mockReturnValue(2),

      reminderRegistry: createReminderRegistry({
        removedEntries: 3,
      }),

      loggerInstance,

      now: new Date('2026-08-10T00:00:00.000Z'),
    });

    expect(loggerInstance.info).toHaveBeenCalledWith(
      {
        cleanup: result,
      },
      'Scheduled cleanup completed.',
    );
  });

  test('preserves cleanup dependency failures', async () => {
    const error = new Error('Cache cleanup failed.');

    await expect(
      runCleanup({
        removeExpiredAnalyticsCacheEntriesFn: jest
          .fn()
          .mockImplementation(() => {
            throw error;
          }),

        removeFinishedNotificationJobsFn: jest.fn(),

        reminderRegistry: createReminderRegistry(),

        loggerInstance: createLogger(),
      }),
    ).rejects.toBe(error);
  });

  test('rejects an invalid cleanup date', async () => {
    await expect(
      runCleanup({
        now: new Date('invalid'),
      }),
    ).rejects.toThrow('Cleanup date must be valid.');
  });

  test('rejects negative notification retention days', async () => {
    await expect(
      runCleanup({
        notificationRetentionDays: -1,
      }),
    ).rejects.toThrow(
      'Notification retention days must be a non-negative integer.',
    );
  });

  test('rejects decimal reminder retention days', async () => {
    await expect(
      runCleanup({
        reminderRetentionDays: 1.5,
      }),
    ).rejects.toThrow(
      'Reminder retention days must be a non-negative integer.',
    );
  });
});
