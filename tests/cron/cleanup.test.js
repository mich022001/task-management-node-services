import { jest } from '@jest/globals';

import { runCleanup } from '../../src/cron/cleanup.job.js';

function createLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
  };
}

function createReminderRegistry({ removedEntries = 0 } = {}) {
  return {
    removeOlderThan: jest.fn().mockReturnValue(removedEntries),
  };
}

function createTaskPage(tasks, currentPage = 1, lastPage = 1) {
  return {
    data: tasks,
    meta: {
      current_page: currentPage,
      last_page: lastPage,
    },
  };
}

describe('Cleanup job', () => {
  test('removes local data and archives old cancelled tasks', async () => {
    const archiveTaskFn = jest.fn().mockResolvedValue({
      data: {
        task_id: 'task-1',
      },
    });

    const result = await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(3),
      removeFinishedNotificationJobsFn: jest.fn().mockReturnValue(4),
      reminderRegistry: createReminderRegistry({
        removedEntries: 2,
      }),
      getTasksFn: jest.fn().mockResolvedValue(
        createTaskPage([
          {
            id: 'task-1',
            status: 'cancelled',
          },
        ]),
      ),
      archiveTaskFn,
      loggerInstance: createLogger(),
      now: new Date('2026-08-10T00:00:00.000Z'),
    });

    expect(archiveTaskFn).toHaveBeenCalledWith('task-1');

    expect(result).toEqual({
      executed_at: '2026-08-10T00:00:00.000Z',
      retention: {
        notification_jobs_days: 7,
        reminder_entries_days: 2,
        cancelled_tasks_days: 30,
      },
      removed: {
        analytics_cache_entries: 3,
        notification_jobs: 4,
        reminder_entries: 2,
        cancelled_tasks: 1,
        total: 10,
      },
      failed: {
        cancelled_tasks: 0,
      },
    });
  });

  test('requests cancelled tasks older than thirty days', async () => {
    const getTasksFn = jest.fn().mockResolvedValue(createTaskPage([]));

    await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(0),
      removeFinishedNotificationJobsFn: jest.fn().mockReturnValue(0),
      reminderRegistry: createReminderRegistry(),
      getTasksFn,
      archiveTaskFn: jest.fn(),
      loggerInstance: createLogger(),
      now: new Date('2026-08-10T00:00:00.000Z'),
    });

    expect(getTasksFn).toHaveBeenCalledWith({
      status: 'cancelled',
      cancelled_before: '2026-07-11T00:00:00.000Z',
      page: 1,
      per_page: 100,
    });
  });

  test('retrieves every Laravel page before archiving tasks', async () => {
    const getTasksFn = jest
      .fn()
      .mockResolvedValueOnce(
        createTaskPage(
          [
            {
              id: 'task-1',
            },
          ],
          1,
          2,
        ),
      )
      .mockResolvedValueOnce(
        createTaskPage(
          [
            {
              id: 'task-2',
            },
          ],
          2,
          2,
        ),
      );

    const archiveTaskFn = jest.fn().mockResolvedValue({});

    const result = await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(0),
      removeFinishedNotificationJobsFn: jest.fn().mockReturnValue(0),
      reminderRegistry: createReminderRegistry(),
      getTasksFn,
      archiveTaskFn,
      loggerInstance: createLogger(),
      now: new Date('2026-08-10T00:00:00.000Z'),
    });

    expect(getTasksFn).toHaveBeenNthCalledWith(1, {
      status: 'cancelled',
      cancelled_before: '2026-07-11T00:00:00.000Z',
      page: 1,
      per_page: 100,
    });

    expect(getTasksFn).toHaveBeenNthCalledWith(2, {
      status: 'cancelled',
      cancelled_before: '2026-07-11T00:00:00.000Z',
      page: 2,
      per_page: 100,
    });

    expect(archiveTaskFn).toHaveBeenCalledTimes(2);
    expect(result.removed.cancelled_tasks).toBe(2);
  });

  test('continues archiving after one task fails', async () => {
    const loggerInstance = createLogger();

    const archiveTaskFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Archive failed.'))
      .mockResolvedValueOnce({});

    const result = await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(0),
      removeFinishedNotificationJobsFn: jest.fn().mockReturnValue(0),
      reminderRegistry: createReminderRegistry(),
      getTasksFn: jest.fn().mockResolvedValue(
        createTaskPage([
          {
            id: 'task-1',
          },
          {
            id: 'task-2',
          },
        ]),
      ),
      archiveTaskFn,
      loggerInstance,
      now: new Date('2026-08-10T00:00:00.000Z'),
    });

    expect(archiveTaskFn).toHaveBeenCalledTimes(2);

    expect(result.removed.cancelled_tasks).toBe(1);
    expect(result.failed.cancelled_tasks).toBe(1);

    expect(loggerInstance.error).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
      }),
      'Failed to archive cancelled task.',
    );
  });

  test('uses the expected local cleanup cutoffs', async () => {
    const removeFinishedNotificationJobsFn = jest.fn().mockReturnValue(0);
    const reminderRegistry = createReminderRegistry();

    await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(0),
      removeFinishedNotificationJobsFn,
      reminderRegistry,
      getTasksFn: jest.fn().mockResolvedValue(createTaskPage([])),
      archiveTaskFn: jest.fn(),
      loggerInstance: createLogger(),
      now: new Date('2026-08-10T00:00:00.000Z'),
      notificationRetentionDays: 7,
      reminderRetentionDays: 2,
    });

    expect(removeFinishedNotificationJobsFn).toHaveBeenCalledWith({
      olderThan: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(reminderRegistry.removeOlderThan).toHaveBeenCalledWith(
      new Date('2026-08-08T00:00:00.000Z'),
    );
  });

  test('supports custom retention periods', async () => {
    const getTasksFn = jest.fn().mockResolvedValue(createTaskPage([]));

    const result = await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(1),
      removeFinishedNotificationJobsFn: jest.fn().mockReturnValue(1),
      reminderRegistry: createReminderRegistry({
        removedEntries: 1,
      }),
      getTasksFn,
      archiveTaskFn: jest.fn(),
      loggerInstance: createLogger(),
      now: new Date('2026-08-10T00:00:00.000Z'),
      notificationRetentionDays: 14,
      reminderRetentionDays: 5,
      cancelledTaskRetentionDays: 60,
    });

    expect(result.retention).toEqual({
      notification_jobs_days: 14,
      reminder_entries_days: 5,
      cancelled_tasks_days: 60,
    });

    expect(getTasksFn).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelled_before: '2026-06-11T00:00:00.000Z',
      }),
    );
  });

  test('returns zero counts when nothing is removed', async () => {
    const result = await runCleanup({
      removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(0),
      removeFinishedNotificationJobsFn: jest.fn().mockReturnValue(0),
      reminderRegistry: createReminderRegistry(),
      getTasksFn: jest.fn().mockResolvedValue(createTaskPage([])),
      archiveTaskFn: jest.fn(),
      loggerInstance: createLogger(),
      now: new Date('2026-08-10T00:00:00.000Z'),
    });

    expect(result.removed).toEqual({
      analytics_cache_entries: 0,
      notification_jobs: 0,
      reminder_entries: 0,
      cancelled_tasks: 0,
      total: 0,
    });

    expect(result.failed).toEqual({
      cancelled_tasks: 0,
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
      getTasksFn: jest.fn().mockResolvedValue(createTaskPage([])),
      archiveTaskFn: jest.fn(),
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

  test('preserves Laravel listing failures', async () => {
    const error = new Error('Laravel unavailable.');

    await expect(
      runCleanup({
        removeExpiredAnalyticsCacheEntriesFn: jest.fn().mockReturnValue(0),
        removeFinishedNotificationJobsFn: jest.fn().mockReturnValue(0),
        reminderRegistry: createReminderRegistry(),
        getTasksFn: jest.fn().mockRejectedValue(error),
        archiveTaskFn: jest.fn(),
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

  test('rejects invalid retention periods', async () => {
    await expect(
      runCleanup({
        notificationRetentionDays: -1,
      }),
    ).rejects.toThrow(
      'Notification retention days must be a non-negative integer.',
    );

    await expect(
      runCleanup({
        reminderRetentionDays: 1.5,
      }),
    ).rejects.toThrow(
      'Reminder retention days must be a non-negative integer.',
    );

    await expect(
      runCleanup({
        cancelledTaskRetentionDays: -1,
      }),
    ).rejects.toThrow(
      'Cancelled task retention days must be a non-negative integer.',
    );
  });
});
