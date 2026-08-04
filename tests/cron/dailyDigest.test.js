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
    assigned_to: null,
    ...overrides,
  };
}

function createLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
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

    expect(result).toMatchObject({
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

  test('groups incomplete tasks and queues one digest per assigned user', async () => {
    const getTasksFn = jest.fn().mockResolvedValue({
      data: [
        createTask({
          id: 1,
          title: 'Write API documentation',
          status: 'pending',
          assigned_to: 10,
        }),
        createTask({
          id: 2,
          title: 'Review integration tests',
          status: 'in_progress',
          assigned_to: 10,
        }),
        createTask({
          id: 3,
          title: 'Deploy release',
          status: 'pending',
          assigned_to: 20,
        }),
        createTask({
          id: 4,
          status: 'completed',
          assigned_to: 10,
        }),
      ],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const getUserFn = jest.fn(async (userId) => ({
      data: {
        id: userId,
        name: userId === 10 ? 'Michael Developer' : 'Jane Manager',
        email: userId === 10 ? 'michael@example.com' : 'jane@example.com',
      },
    }));

    const enqueueNotificationFn = jest.fn();
    const processQueueFn = jest.fn().mockResolvedValue(undefined);

    const result = await runDailyDigest({
      getTasksFn,
      getUserFn,
      enqueueNotificationFn,
      processQueueFn,
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(getUserFn).toHaveBeenCalledTimes(2);
    expect(getUserFn).toHaveBeenCalledWith(10);
    expect(getUserFn).toHaveBeenCalledWith(20);

    expect(enqueueNotificationFn).toHaveBeenCalledTimes(2);

    expect(enqueueNotificationFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'custom',
        recipient_email: 'michael@example.com',
        subject: 'Daily task digest — 2 incomplete tasks',
        message: expect.stringContaining('Write API documentation'),
      }),
    );

    expect(enqueueNotificationFn).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_email: 'jane@example.com',
        subject: 'Daily task digest — 1 incomplete task',
        message: expect.stringContaining('Deploy release'),
      }),
    );

    expect(processQueueFn).toHaveBeenCalledTimes(1);

    expect(result).toMatchObject({
      incomplete_tasks: 3,
      users_with_incomplete_tasks: 2,
      queued_digests: 2,
      skipped_unassigned_tasks: 0,
      skipped_without_email: 0,
      failed_digests: 0,
    });
  });

  test('does not include completed or cancelled tasks in digest emails', async () => {
    const getTasksFn = jest.fn().mockResolvedValue({
      data: [
        createTask({
          id: 1,
          title: 'Pending task',
          status: 'pending',
          assigned_to: 10,
        }),
        createTask({
          id: 2,
          title: 'Completed task',
          status: 'completed',
          assigned_to: 10,
        }),
        createTask({
          id: 3,
          title: 'Cancelled task',
          status: 'cancelled',
          assigned_to: 10,
        }),
      ],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const enqueueNotificationFn = jest.fn();

    await runDailyDigest({
      getTasksFn,
      getUserFn: jest.fn().mockResolvedValue({
        data: {
          id: 10,
          name: 'Michael',
          email: 'michael@example.com',
        },
      }),
      enqueueNotificationFn,
      processQueueFn: jest.fn(),
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    const notification = enqueueNotificationFn.mock.calls[0][0];

    expect(notification.message).toContain('Pending task');
    expect(notification.message).not.toContain('Completed task');
    expect(notification.message).not.toContain('Cancelled task');
  });

  test('skips unassigned incomplete tasks', async () => {
    const getUserFn = jest.fn();
    const enqueueNotificationFn = jest.fn();
    const processQueueFn = jest.fn();

    const result = await runDailyDigest({
      getTasksFn: jest.fn().mockResolvedValue({
        data: [
          createTask({
            id: 1,
            status: 'pending',
            assigned_to: null,
          }),
        ],
        meta: {
          current_page: 1,
          last_page: 1,
        },
      }),
      getUserFn,
      enqueueNotificationFn,
      processQueueFn,
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(getUserFn).not.toHaveBeenCalled();
    expect(enqueueNotificationFn).not.toHaveBeenCalled();
    expect(processQueueFn).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      incomplete_tasks: 1,
      queued_digests: 0,
      skipped_unassigned_tasks: 1,
    });
  });

  test('skips an assigned user without an email address', async () => {
    const loggerInstance = createLogger();
    const enqueueNotificationFn = jest.fn();
    const processQueueFn = jest.fn();

    const result = await runDailyDigest({
      getTasksFn: jest.fn().mockResolvedValue({
        data: [
          createTask({
            id: 1,
            assigned_to: 10,
          }),
        ],
        meta: {
          current_page: 1,
          last_page: 1,
        },
      }),
      getUserFn: jest.fn().mockResolvedValue({
        data: {
          id: 10,
          name: 'No Email User',
          email: null,
        },
      }),
      enqueueNotificationFn,
      processQueueFn,
      loggerInstance,
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(enqueueNotificationFn).not.toHaveBeenCalled();
    expect(processQueueFn).not.toHaveBeenCalled();
    expect(result.skipped_without_email).toBe(1);

    expect(loggerInstance.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        assigneeId: 10,
        reason: 'missing_email',
      }),
      'Daily digest skipped.',
    );
  });

  test('continues when one user lookup fails', async () => {
    const enqueueNotificationFn = jest.fn();
    const processQueueFn = jest.fn().mockResolvedValue(undefined);

    const getUserFn = jest.fn(async (userId) => {
      if (userId === 10) {
        throw new Error('User service unavailable.');
      }

      return {
        data: {
          id: userId,
          name: 'Available User',
          email: 'available@example.com',
        },
      };
    });

    const result = await runDailyDigest({
      getTasksFn: jest.fn().mockResolvedValue({
        data: [
          createTask({
            id: 1,
            assigned_to: 10,
          }),
          createTask({
            id: 2,
            assigned_to: 20,
          }),
        ],
        meta: {
          current_page: 1,
          last_page: 1,
        },
      }),
      getUserFn,
      enqueueNotificationFn,
      processQueueFn,
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(enqueueNotificationFn).toHaveBeenCalledTimes(1);
    expect(processQueueFn).toHaveBeenCalledTimes(1);

    expect(result).toMatchObject({
      queued_digests: 1,
      failed_digests: 1,
    });
  });

  test('does not process the queue when no digest is queued', async () => {
    const processQueueFn = jest.fn();

    await runDailyDigest({
      getTasksFn: jest.fn().mockResolvedValue({
        data: [],
        meta: {
          current_page: 1,
          last_page: 1,
        },
      }),
      processQueueFn,
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(processQueueFn).not.toHaveBeenCalled();
  });
});
