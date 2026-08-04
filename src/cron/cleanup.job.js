import { removeExpiredAnalyticsCacheEntries } from '../cache/analytics.cache.js';
import { archiveTask, getTasks } from '../clients/laravel/taskClient.js';
import { logger } from '../config/logger.js';
import { removeFinishedNotificationJobs } from '../queues/notification.queue.js';
import { deadlineReminderRegistry } from './deadlineReminder.job.js';

const DEFAULT_NOTIFICATION_RETENTION_DAYS = 7;
const DEFAULT_REMINDER_RETENTION_DAYS = 2;
const DEFAULT_CANCELLED_TASK_RETENTION_DAYS = 30;

function subtractDays(date, days) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function validateRetentionDays(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer.`);
  }
}

async function getAllArchivableCancelledTasks({ getTasksFn, cancelledBefore }) {
  const tasks = [];
  let currentPage = 1;
  let lastPage = 1;

  do {
    const response = await getTasksFn({
      status: 'cancelled',
      cancelled_before: cancelledBefore.toISOString(),
      page: currentPage,
      per_page: 100,
    });

    tasks.push(...(response.data ?? []));

    lastPage = response.meta?.last_page ?? currentPage;
    currentPage += 1;
  } while (currentPage <= lastPage);

  return tasks;
}

export async function runCleanup({
  removeExpiredAnalyticsCacheEntriesFn = removeExpiredAnalyticsCacheEntries,
  removeFinishedNotificationJobsFn = removeFinishedNotificationJobs,
  reminderRegistry = deadlineReminderRegistry,
  getTasksFn = getTasks,
  archiveTaskFn = archiveTask,
  loggerInstance = logger,
  now = new Date(),
  notificationRetentionDays = DEFAULT_NOTIFICATION_RETENTION_DAYS,
  reminderRetentionDays = DEFAULT_REMINDER_RETENTION_DAYS,
  cancelledTaskRetentionDays = DEFAULT_CANCELLED_TASK_RETENTION_DAYS,
} = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('Cleanup date must be valid.');
  }

  validateRetentionDays(
    notificationRetentionDays,
    'Notification retention days',
  );

  validateRetentionDays(reminderRetentionDays, 'Reminder retention days');

  validateRetentionDays(
    cancelledTaskRetentionDays,
    'Cancelled task retention days',
  );

  const notificationCutoff = subtractDays(now, notificationRetentionDays);
  const reminderCutoff = subtractDays(now, reminderRetentionDays);
  const cancelledTaskCutoff = subtractDays(now, cancelledTaskRetentionDays);

  const expiredCacheEntries = removeExpiredAnalyticsCacheEntriesFn();

  const removedNotificationJobs = removeFinishedNotificationJobsFn({
    olderThan: notificationCutoff,
  });

  const removedReminderEntries =
    reminderRegistry.removeOlderThan(reminderCutoff);

  const cancelledTasks = await getAllArchivableCancelledTasks({
    getTasksFn,
    cancelledBefore: cancelledTaskCutoff,
  });

  let archivedCancelledTasks = 0;
  let failedCancelledTaskArchives = 0;

  for (const task of cancelledTasks) {
    try {
      await archiveTaskFn(task.id);
      archivedCancelledTasks += 1;
    } catch (error) {
      failedCancelledTaskArchives += 1;

      loggerInstance.error(
        {
          taskId: task.id,
          error: {
            name: error.name ?? 'Error',
            code: error.code ?? null,
            message: error.message ?? 'Task archival failed.',
          },
        },
        'Failed to archive cancelled task.',
      );
    }
  }

  const result = {
    executed_at: now.toISOString(),

    retention: {
      notification_jobs_days: notificationRetentionDays,
      reminder_entries_days: reminderRetentionDays,
      cancelled_tasks_days: cancelledTaskRetentionDays,
    },

    removed: {
      analytics_cache_entries: expiredCacheEntries,
      notification_jobs: removedNotificationJobs,
      reminder_entries: removedReminderEntries,
      cancelled_tasks: archivedCancelledTasks,
      total:
        expiredCacheEntries +
        removedNotificationJobs +
        removedReminderEntries +
        archivedCancelledTasks,
    },

    failed: {
      cancelled_tasks: failedCancelledTaskArchives,
    },
  };

  loggerInstance.info(
    {
      cleanup: result,
    },
    'Scheduled cleanup completed.',
  );

  return result;
}
