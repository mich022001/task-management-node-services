import { jest } from '@jest/globals';

import { runLoggedCronJob } from '../../src/services/cronLogger.service.js';

function createLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
  };
}

describe('Cron logger service', () => {
  test('logs job start and completion', async () => {
    const loggerInstance = createLogger();

    const timestamps = [
      Date.parse('2026-08-02T08:00:00.000Z'),
      Date.parse('2026-08-02T08:00:00.250Z'),
    ];

    const now = jest.fn(() => timestamps.shift());

    const result = await runLoggedCronJob({
      jobName: 'daily_digest',
      handler: async () => ({
        total_tasks: 10,
      }),
      loggerInstance,
      now,
    });

    expect(result).toEqual({
      total_tasks: 10,
    });

    expect(loggerInstance.info).toHaveBeenNthCalledWith(
      1,
      {
        job: 'daily_digest',
        status: 'started',
        started_at: '2026-08-02T08:00:00.000Z',
      },
      'Scheduled job started.',
    );

    expect(loggerInstance.info).toHaveBeenNthCalledWith(
      2,
      {
        job: 'daily_digest',
        status: 'completed',
        duration_ms: 250,
        started_at: '2026-08-02T08:00:00.000Z',
        finished_at: '2026-08-02T08:00:00.250Z',
        result: {
          total_tasks: 10,
        },
      },
      'Scheduled job completed.',
    );

    expect(loggerInstance.error).not.toHaveBeenCalled();
  });

  test('logs job failure and rethrows the error', async () => {
    const loggerInstance = createLogger();

    const timestamps = [
      Date.parse('2026-08-02T09:00:00.000Z'),
      Date.parse('2026-08-02T09:00:00.100Z'),
    ];

    const now = jest.fn(() => timestamps.shift());

    const error = Object.assign(new Error('Laravel request timed out.'), {
      code: 'LARAVEL_TIMEOUT',
    });

    await expect(
      runLoggedCronJob({
        jobName: 'deadline_reminder',
        handler: async () => {
          throw error;
        },
        loggerInstance,
        now,
      }),
    ).rejects.toBe(error);

    expect(loggerInstance.error).toHaveBeenCalledWith(
      {
        job: 'deadline_reminder',
        status: 'failed',
        duration_ms: 100,
        started_at: '2026-08-02T09:00:00.000Z',
        finished_at: '2026-08-02T09:00:00.100Z',
        error: {
          name: 'Error',
          code: 'LARAVEL_TIMEOUT',
          message: 'Laravel request timed out.',
        },
      },
      'Scheduled job failed.',
    );
  });

  test('normalizes an undefined result to null', async () => {
    const loggerInstance = createLogger();

    const timestamps = [
      Date.parse('2026-08-02T10:00:00.000Z'),
      Date.parse('2026-08-02T10:00:00.001Z'),
    ];

    await runLoggedCronJob({
      jobName: 'cleanup',
      handler: async () => undefined,
      loggerInstance,
      now: () => timestamps.shift(),
    });

    expect(loggerInstance.info).toHaveBeenLastCalledWith(
      expect.objectContaining({
        result: null,
      }),
      'Scheduled job completed.',
    );
  });

  test('rejects a missing job name', async () => {
    await expect(
      runLoggedCronJob({
        jobName: '',
        handler: async () => undefined,
      }),
    ).rejects.toThrow(TypeError);
  });

  test('rejects a non-function handler', async () => {
    await expect(
      runLoggedCronJob({
        jobName: 'cleanup',
        handler: null,
      }),
    ).rejects.toThrow(TypeError);
  });
});
