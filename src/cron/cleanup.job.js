import { removeExpiredAnalyticsCacheEntries } from '../cache/analytics.cache.js';
import { logger } from '../config/logger.js';
import { deadlineReminderRegistry } from './deadlineReminder.job.js';
import { removeFinishedNotificationJobs } from '../queues/notification.queue.js';

const DEFAULT_NOTIFICATION_RETENTION_DAYS = 7;
const DEFAULT_REMINDER_RETENTION_DAYS = 2;

function subtractDays(date, days) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function validateRetentionDays(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer.`);
  }
}

export async function runCleanup({
  removeExpiredAnalyticsCacheEntriesFn = removeExpiredAnalyticsCacheEntries,

  removeFinishedNotificationJobsFn = removeFinishedNotificationJobs,

  reminderRegistry = deadlineReminderRegistry,
  loggerInstance = logger,
  now = new Date(),

  notificationRetentionDays = DEFAULT_NOTIFICATION_RETENTION_DAYS,

  reminderRetentionDays = DEFAULT_REMINDER_RETENTION_DAYS,
} = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('Cleanup date must be valid.');
  }

  validateRetentionDays(
    notificationRetentionDays,
    'Notification retention days',
  );

  validateRetentionDays(reminderRetentionDays, 'Reminder retention days');

  const notificationCutoff = subtractDays(now, notificationRetentionDays);

  const reminderCutoff = subtractDays(now, reminderRetentionDays);

  const expiredCacheEntries = removeExpiredAnalyticsCacheEntriesFn();

  const removedNotificationJobs = removeFinishedNotificationJobsFn({
    olderThan: notificationCutoff,
  });

  const removedReminderEntries =
    reminderRegistry.removeOlderThan(reminderCutoff);

  const result = {
    executed_at: now.toISOString(),

    retention: {
      notification_jobs_days: notificationRetentionDays,
      reminder_entries_days: reminderRetentionDays,
    },

    removed: {
      analytics_cache_entries: expiredCacheEntries,
      notification_jobs: removedNotificationJobs,
      reminder_entries: removedReminderEntries,
      total:
        expiredCacheEntries + removedNotificationJobs + removedReminderEntries,
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
