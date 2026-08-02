import { jest } from '@jest/globals';

import { runDailyDigest } from '../../src/cron/dailyDigest.job.js';

function createTask(overrides = {}) {
  return {
    id: 1,
    team_id: 1,
    title: 'Task',
    status: 'pending',
    priority: 'medium',
    due_date: null,
    ...overrides,
  };
}

function createLogger() {
  return {
    info: jest.fn(),
  };
}

describe('Daily digest job', () => {
  test('retrieves tasks and builds a digest summary', async () => {
    const getTasksFn = jest.fn().mockResolvedValue({
      data: [
        createTask({
          id: 1,
          status: 'pending',
        }),
        createTask({
          id: 2,
          status: 'completed',
          priority: 'high',
        }),
      ],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const loggerInstance = createLogger();
    const now = new Date('2026-08-03T00:00:00.000Z');

    const result = await runDailyDigest({
      getTasksFn,
      loggerInstance,
      now,
    });

    expect(result).toEqual({
      generated_at: '2026-08-03T00:00:00.000Z',
      total_tasks: 2,
      pending_tasks: 1,
      in_progress_tasks: 0,
      completed_tasks: 1,
      cancelled_tasks: 0,
      overdue_tasks: 0,
      completion_rate: 50,
      priority: {
        low: 0,
        medium: 1,
        high: 1,
      },
    });

    expect(getTasksFn).toHaveBeenCalledWith({
      page: 1,
      per_page: 100,
    });
  });

  test('retrieves every Laravel task page', async () => {
    const getTasksFn = jest
      .fn()
      .mockResolvedValueOnce({
        data: [
          createTask({
            id: 1,
          }),
        ],
        meta: {
          current_page: 1,
          last_page: 2,
        },
      })
      .mockResolvedValueOnce({
        data: [
          createTask({
            id: 2,
            status: 'completed',
          }),
        ],
        meta: {
          current_page: 2,
          last_page: 2,
        },
      });

    const result = await runDailyDigest({
      getTasksFn,
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(getTasksFn).toHaveBeenNthCalledWith(1, {
      page: 1,
      per_page: 100,
    });

    expect(getTasksFn).toHaveBeenNthCalledWith(2, {
      page: 2,
      per_page: 100,
    });

    expect(result.total_tasks).toBe(2);
  });

  test('returns zero values when there are no tasks', async () => {
    const getTasksFn = jest.fn().mockResolvedValue({
      data: [],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const result = await runDailyDigest({
      getTasksFn,
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      total_tasks: 0,
      pending_tasks: 0,
      in_progress_tasks: 0,
      completed_tasks: 0,
      cancelled_tasks: 0,
      overdue_tasks: 0,
      completion_rate: 0,
    });
  });

  test('counts overdue incomplete tasks', async () => {
    const getTasksFn = jest.fn().mockResolvedValue({
      data: [
        createTask({
          id: 1,
          status: 'in_progress',
          due_date: '2026-08-01T00:00:00.000Z',
        }),
        createTask({
          id: 2,
          status: 'completed',
          due_date: '2026-08-01T00:00:00.000Z',
        }),
      ],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const result = await runDailyDigest({
      getTasksFn,
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(result.overdue_tasks).toBe(1);
  });

  test('logs the generated digest', async () => {
    const getTasksFn = jest.fn().mockResolvedValue({
      data: [createTask()],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const loggerInstance = createLogger();

    const result = await runDailyDigest({
      getTasksFn,
      loggerInstance,
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(loggerInstance.info).toHaveBeenCalledWith(
      {
        digest: result,
      },
      'Daily task digest generated.',
    );
  });

  test('uses the analytics summary service', async () => {
    const getTasksFn = jest.fn().mockResolvedValue({
      data: [createTask()],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const buildTaskSummaryFn = jest.fn().mockReturnValue({
      total_tasks: 20,
      status: {
        pending: 5,
        in_progress: 4,
        completed: 10,
        cancelled: 1,
      },
      priority: {
        low: 3,
        medium: 9,
        high: 8,
      },
      overdue_tasks: 2,
      completion_rate: 50,
    });

    const now = new Date('2026-08-03T00:00:00.000Z');

    const result = await runDailyDigest({
      getTasksFn,
      buildTaskSummaryFn,
      loggerInstance: createLogger(),
      now,
    });

    expect(buildTaskSummaryFn).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 1 })],
      {
        now,
      },
    );

    expect(result.total_tasks).toBe(20);
    expect(result.overdue_tasks).toBe(2);
  });

  test('preserves Laravel failures', async () => {
    const error = Object.assign(new Error('Laravel service unavailable.'), {
      code: 'LARAVEL_UNAVAILABLE',
      statusCode: 503,
    });

    const getTasksFn = jest.fn().mockRejectedValue(error);

    await expect(
      runDailyDigest({
        getTasksFn,
        loggerInstance: createLogger(),
      }),
    ).rejects.toBe(error);
  });
});
