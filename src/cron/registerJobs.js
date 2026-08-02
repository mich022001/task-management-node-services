import { runLoggedCronJob } from '../services/cronLogger.service.js';
import { runCleanup } from './cleanup.job.js';
import { runDailyDigest } from './dailyDigest.job.js';
import { runDeadlineReminder } from './deadlineReminder.job.js';
import { CRON_SCHEDULES, cronScheduler } from './scheduler.js';

export function registerCronJobs({
  scheduler = cronScheduler,
  runDailyDigestFn = runDailyDigest,
  runDeadlineReminderFn = runDeadlineReminder,
  runCleanupFn = runCleanup,
  runLoggedCronJobFn = runLoggedCronJob,
} = {}) {
  scheduler
    .registerJob({
      name: 'daily_digest',
      schedule: CRON_SCHEDULES.dailyDigest,
      handler: () =>
        runLoggedCronJobFn({
          jobName: 'daily_digest',
          handler: runDailyDigestFn,
        }),
    })
    .registerJob({
      name: 'deadline_reminder',
      schedule: CRON_SCHEDULES.deadlineReminder,
      handler: () =>
        runLoggedCronJobFn({
          jobName: 'deadline_reminder',
          handler: runDeadlineReminderFn,
        }),
    })
    .registerJob({
      name: 'cleanup',
      schedule: CRON_SCHEDULES.cleanup,
      handler: () =>
        runLoggedCronJobFn({
          jobName: 'cleanup',
          handler: runCleanupFn,
        }),
    });

  return scheduler.getRegisteredJobs();
}
