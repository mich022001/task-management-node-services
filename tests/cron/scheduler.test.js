import { jest } from '@jest/globals';

import { CronScheduler } from '../../src/cron/scheduler.js';

function createLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function createCronMock() {
  const tasks = [];

  const cronInstance = {
    validate: jest.fn(() => true),

    schedule: jest.fn((schedule, callback, options) => {
      const task = {
        schedule,
        callback,
        options,
        start: jest.fn(),
        stop: jest.fn(),
        destroy: jest.fn(),
      };

      tasks.push(task);

      return task;
    }),
  };

  return {
    cronInstance,
    tasks,
  };
}

describe('Cron scheduler', () => {
  test('registers and starts scheduled jobs', () => {
    const loggerInstance = createLogger();
    const { cronInstance, tasks } = createCronMock();

    const scheduler = new CronScheduler({
      cronInstance,
      loggerInstance,
      timezone: 'Asia/Manila',
    });

    scheduler.registerJob({
      name: 'daily_digest',
      schedule: '0 8 * * *',
      handler: jest.fn(),
    });

    expect(scheduler.start()).toBe(true);
    expect(scheduler.isStarted()).toBe(true);

    expect(cronInstance.schedule).toHaveBeenCalledWith(
      '0 8 * * *',
      expect.any(Function),
      {
        scheduled: false,
        timezone: 'Asia/Manila',
      },
    );

    expect(tasks[0].start).toHaveBeenCalledTimes(1);
  });

  test('prevents duplicate scheduler startup', () => {
    const { cronInstance } = createCronMock();

    const scheduler = new CronScheduler({
      cronInstance,
      loggerInstance: createLogger(),
    });

    scheduler.registerJob({
      name: 'cleanup',
      schedule: '0 0 * * *',
      handler: jest.fn(),
    });

    expect(scheduler.start()).toBe(true);
    expect(scheduler.start()).toBe(false);
    expect(cronInstance.schedule).toHaveBeenCalledTimes(1);
  });

  test('stops every scheduled task', async () => {
    const { cronInstance, tasks } = createCronMock();

    const scheduler = new CronScheduler({
      cronInstance,
      loggerInstance: createLogger(),
    });

    scheduler
      .registerJob({
        name: 'daily_digest',
        schedule: '0 8 * * *',
        handler: jest.fn(),
      })
      .registerJob({
        name: 'cleanup',
        schedule: '0 0 * * *',
        handler: jest.fn(),
      });

    scheduler.start();

    expect(await scheduler.stop()).toBe(true);
    expect(scheduler.isStarted()).toBe(false);

    for (const task of tasks) {
      expect(task.stop).toHaveBeenCalledTimes(1);
      expect(task.destroy).toHaveBeenCalledTimes(1);
    }
  });

  test('waits for a running job during shutdown', async () => {
    const { cronInstance, tasks } = createCronMock();

    let finishJob;

    const jobGate = new Promise((resolve) => {
      finishJob = resolve;
    });

    const scheduler = new CronScheduler({
      cronInstance,
      loggerInstance: createLogger(),
    });

    scheduler.registerJob({
      name: 'deadline_reminder',
      schedule: '0 * * * *',
      handler: async () => {
        await jobGate;
      },
    });

    scheduler.start();

    tasks[0].callback();

    await Promise.resolve();

    let stopCompleted = false;

    const stopPromise = scheduler.stop().then(() => {
      stopCompleted = true;
    });

    await Promise.resolve();

    expect(stopCompleted).toBe(false);

    finishJob();

    await stopPromise;

    expect(stopCompleted).toBe(true);
  });

  test('skips overlapping executions of the same job', async () => {
    const loggerInstance = createLogger();
    const { cronInstance, tasks } = createCronMock();

    let finishJob;

    const jobGate = new Promise((resolve) => {
      finishJob = resolve;
    });

    const handler = jest.fn(async () => {
      await jobGate;
    });

    const scheduler = new CronScheduler({
      cronInstance,
      loggerInstance,
    });

    scheduler.registerJob({
      name: 'cleanup',
      schedule: '0 0 * * *',
      handler,
    });

    scheduler.start();

    tasks[0].callback();
    tasks[0].callback();

    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);

    expect(loggerInstance.warn).toHaveBeenCalledWith(
      {
        job: 'cleanup',
        status: 'skipped',
        reason: 'already_running',
      },
      'Scheduled job execution skipped.',
    );

    finishJob();

    await scheduler.stop();
  });

  test('rejects duplicate job registration', () => {
    const { cronInstance } = createCronMock();

    const scheduler = new CronScheduler({
      cronInstance,
      loggerInstance: createLogger(),
    });

    scheduler.registerJob({
      name: 'cleanup',
      schedule: '0 0 * * *',
      handler: jest.fn(),
    });

    expect(() =>
      scheduler.registerJob({
        name: 'cleanup',
        schedule: '0 1 * * *',
        handler: jest.fn(),
      }),
    ).toThrow('Cron job is already registered: cleanup');
  });

  test('rejects an invalid cron expression', () => {
    const { cronInstance } = createCronMock();

    cronInstance.validate.mockReturnValue(false);

    const scheduler = new CronScheduler({
      cronInstance,
      loggerInstance: createLogger(),
    });

    expect(() =>
      scheduler.registerJob({
        name: 'invalid_job',
        schedule: 'invalid',
        handler: jest.fn(),
      }),
    ).toThrow(TypeError);
  });

  test('rejects job registration after startup', () => {
    const { cronInstance } = createCronMock();

    const scheduler = new CronScheduler({
      cronInstance,
      loggerInstance: createLogger(),
    });

    scheduler.start();

    expect(() =>
      scheduler.registerJob({
        name: 'cleanup',
        schedule: '0 0 * * *',
        handler: jest.fn(),
      }),
    ).toThrow(
      'Cron jobs cannot be registered after the scheduler has started.',
    );
  });

  test('returns registered job information', () => {
    const { cronInstance } = createCronMock();

    const scheduler = new CronScheduler({
      cronInstance,
      loggerInstance: createLogger(),
    });

    scheduler.registerJob({
      name: 'daily_digest',
      schedule: '0 8 * * *',
      handler: jest.fn(),
    });

    expect(scheduler.getRegisteredJobs()).toEqual([
      {
        name: 'daily_digest',
        schedule: '0 8 * * *',
        running: false,
      },
    ]);
  });
});
