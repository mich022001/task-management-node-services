import { jest } from '@jest/globals';

import { registerCronJobs } from '../../src/cron/registerJobs.js';
import { CRON_SCHEDULES } from '../../src/cron/scheduler.js';

function createScheduler() {
  const registeredJobs = [];

  return {
    registerJob: jest.fn(function registerJob(job) {
      registeredJobs.push(job);

      return this;
    }),

    getRegisteredJobs: jest.fn(() =>
      registeredJobs.map((job) => ({
        name: job.name,
        schedule: job.schedule,
        running: false,
      })),
    ),

    registeredJobs,
  };
}

describe('Cron job registration', () => {
  test('registers daily digest with the daily schedule', () => {
    const scheduler = createScheduler();

    registerCronJobs({
      scheduler,
      runLoggedCronJobFn: jest.fn(),
    });

    expect(scheduler.registeredJobs[0]).toMatchObject({
      name: 'daily_digest',
      schedule: CRON_SCHEDULES.dailyDigest,
      handler: expect.any(Function),
    });

    expect(CRON_SCHEDULES.dailyDigest).toBe('0 8 * * *');
  });

  test('registers deadline reminder with the hourly schedule', () => {
    const scheduler = createScheduler();

    registerCronJobs({
      scheduler,
      runLoggedCronJobFn: jest.fn(),
    });

    expect(scheduler.registeredJobs[1]).toMatchObject({
      name: 'deadline_reminder',
      schedule: CRON_SCHEDULES.deadlineReminder,
      handler: expect.any(Function),
    });

    expect(CRON_SCHEDULES.deadlineReminder).toBe('0 * * * *');
  });

  test('registers cleanup with the midnight schedule', () => {
    const scheduler = createScheduler();

    registerCronJobs({
      scheduler,
      runLoggedCronJobFn: jest.fn(),
    });

    expect(scheduler.registeredJobs[2]).toMatchObject({
      name: 'cleanup',
      schedule: CRON_SCHEDULES.cleanup,
      handler: expect.any(Function),
    });

    expect(CRON_SCHEDULES.cleanup).toBe('0 0 * * *');
  });

  test('returns information for all registered jobs', () => {
    const scheduler = createScheduler();

    const result = registerCronJobs({
      scheduler,
      runLoggedCronJobFn: jest.fn(),
    });

    expect(result).toEqual([
      {
        name: 'daily_digest',
        schedule: '0 8 * * *',
        running: false,
      },
      {
        name: 'deadline_reminder',
        schedule: '0 * * * *',
        running: false,
      },
      {
        name: 'cleanup',
        schedule: '0 0 * * *',
        running: false,
      },
    ]);
  });

  test('wraps daily digest with cron lifecycle logging', async () => {
    const scheduler = createScheduler();
    const runDailyDigestFn = jest.fn().mockResolvedValue({
      total_tasks: 5,
    });

    const runLoggedCronJobFn = jest
      .fn()
      .mockImplementation(async ({ handler }) => handler());

    registerCronJobs({
      scheduler,
      runDailyDigestFn,
      runLoggedCronJobFn,
    });

    const result = await scheduler.registeredJobs[0].handler();

    expect(runLoggedCronJobFn).toHaveBeenCalledWith({
      jobName: 'daily_digest',
      handler: runDailyDigestFn,
    });

    expect(result).toEqual({
      total_tasks: 5,
    });
  });

  test('wraps deadline reminder with cron lifecycle logging', async () => {
    const scheduler = createScheduler();
    const runDeadlineReminderFn = jest.fn().mockResolvedValue({
      queued_reminders: 2,
    });

    const runLoggedCronJobFn = jest
      .fn()
      .mockImplementation(async ({ handler }) => handler());

    registerCronJobs({
      scheduler,
      runDeadlineReminderFn,
      runLoggedCronJobFn,
    });

    const result = await scheduler.registeredJobs[1].handler();

    expect(runLoggedCronJobFn).toHaveBeenCalledWith({
      jobName: 'deadline_reminder',
      handler: runDeadlineReminderFn,
    });

    expect(result).toEqual({
      queued_reminders: 2,
    });
  });

  test('wraps cleanup with cron lifecycle logging', async () => {
    const scheduler = createScheduler();
    const runCleanupFn = jest.fn().mockResolvedValue({
      removed: {
        total: 3,
      },
    });

    const runLoggedCronJobFn = jest
      .fn()
      .mockImplementation(async ({ handler }) => handler());

    registerCronJobs({
      scheduler,
      runCleanupFn,
      runLoggedCronJobFn,
    });

    const result = await scheduler.registeredJobs[2].handler();

    expect(runLoggedCronJobFn).toHaveBeenCalledWith({
      jobName: 'cleanup',
      handler: runCleanupFn,
    });

    expect(result).toEqual({
      removed: {
        total: 3,
      },
    });
  });

  test('registers exactly three jobs', () => {
    const scheduler = createScheduler();

    registerCronJobs({
      scheduler,
      runLoggedCronJobFn: jest.fn(),
    });

    expect(scheduler.registerJob).toHaveBeenCalledTimes(3);
  });
});
