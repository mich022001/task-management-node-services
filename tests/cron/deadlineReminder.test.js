import { jest } from '@jest/globals';

import {
  DeadlineReminderRegistry,
  runDeadlineReminder,
} from '../../src/cron/deadlineReminder.job.js';

function createTask(overrides = {}) {
  return {
    id: 1,
    team_id: 1,
    title: 'Complete API documentation',
    status: 'pending',
    priority: 'high',
    assigned_to: 3,
    due_date: '2026-08-03T12:00:00.000Z',
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

function createSinglePageResponse(tasks) {
  return {
    data: tasks,
    meta: {
      current_page: 1,
      last_page: 1,
    },
  };
}

describe('Deadline reminder job', () => {
  test('queues reminders for tasks due within 24 hours', async () => {
    const getTasksFn = jest
      .fn()
      .mockResolvedValue(createSinglePageResponse([createTask()]));

    const getUserFn = jest.fn().mockResolvedValue({
      data: {
        user: {
          id: 3,
          name: 'Team Member',
          email: 'member@test.com',
        },
      },
    });

    const enqueueNotificationFn = jest.fn();
    const processQueueFn = jest.fn().mockResolvedValue();

    const result = await runDeadlineReminder({
      getTasksFn,
      getUserFn,
      enqueueNotificationFn,
      processQueueFn,
      reminderRegistry: new DeadlineReminderRegistry(),
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(enqueueNotificationFn).toHaveBeenCalledWith({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Task deadline reminder: Complete API documentation',
      message: expect.stringContaining('Due date: 2026-08-03T12:00:00.000Z'),
    });

    expect(processQueueFn).toHaveBeenCalledTimes(1);

    expect(result).toMatchObject({
      checked_tasks: 1,
      upcoming_tasks: 1,
      queued_reminders: 1,
      skipped_duplicates: 0,
      failed_reminders: 0,
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
            due_date: '2026-08-03T18:00:00.000Z',
          }),
        ],
        meta: {
          current_page: 2,
          last_page: 2,
        },
      });

    const getUserFn = jest.fn().mockResolvedValue({
      data: {
        user: {
          id: 3,
          email: 'member@test.com',
        },
      },
    });

    const result = await runDeadlineReminder({
      getTasksFn,
      getUserFn,
      enqueueNotificationFn: jest.fn(),
      processQueueFn: jest.fn().mockResolvedValue(),
      reminderRegistry: new DeadlineReminderRegistry(),
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

    expect(result.checked_tasks).toBe(2);
    expect(result.queued_reminders).toBe(2);
  });

  test('excludes completed and cancelled tasks', async () => {
    const getTasksFn = jest.fn().mockResolvedValue(
      createSinglePageResponse([
        createTask({
          id: 1,
          status: 'completed',
        }),
        createTask({
          id: 2,
          status: 'cancelled',
        }),
      ]),
    );

    const getUserFn = jest.fn();
    const enqueueNotificationFn = jest.fn();
    const processQueueFn = jest.fn();

    const result = await runDeadlineReminder({
      getTasksFn,
      getUserFn,
      enqueueNotificationFn,
      processQueueFn,
      reminderRegistry: new DeadlineReminderRegistry(),
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(result.upcoming_tasks).toBe(0);
    expect(result.queued_reminders).toBe(0);
    expect(getUserFn).not.toHaveBeenCalled();
    expect(enqueueNotificationFn).not.toHaveBeenCalled();
    expect(processQueueFn).not.toHaveBeenCalled();
  });

  test('does not queue duplicate reminders', async () => {
    const registry = new DeadlineReminderRegistry();

    registry.add(
      '1:2026-08-03T12:00:00.000Z',
      new Date('2026-08-03T00:00:00.000Z'),
    );

    const getTasksFn = jest
      .fn()
      .mockResolvedValue(createSinglePageResponse([createTask()]));

    const enqueueNotificationFn = jest.fn();

    const result = await runDeadlineReminder({
      getTasksFn,
      getUserFn: jest.fn(),
      enqueueNotificationFn,
      processQueueFn: jest.fn(),
      reminderRegistry: registry,
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T01:00:00.000Z'),
    });

    expect(result.skipped_duplicates).toBe(1);
    expect(result.queued_reminders).toBe(0);
    expect(enqueueNotificationFn).not.toHaveBeenCalled();
  });

  test('skips tasks without an assignee', async () => {
    const getTasksFn = jest.fn().mockResolvedValue(
      createSinglePageResponse([
        createTask({
          assigned_to: null,
        }),
      ]),
    );

    const loggerInstance = createLogger();

    const result = await runDeadlineReminder({
      getTasksFn,
      getUserFn: jest.fn(),
      enqueueNotificationFn: jest.fn(),
      processQueueFn: jest.fn(),
      reminderRegistry: new DeadlineReminderRegistry(),
      loggerInstance,
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(result.skipped_without_assignee).toBe(1);

    expect(loggerInstance.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 1,
        reason: 'missing_assignee',
      }),
      'Deadline reminder skipped.',
    );
  });

  test('skips recipients without an email address', async () => {
    const getTasksFn = jest
      .fn()
      .mockResolvedValue(createSinglePageResponse([createTask()]));

    const getUserFn = jest.fn().mockResolvedValue({
      data: {
        user: {
          id: 3,
          name: 'Team Member',
          email: null,
        },
      },
    });

    const enqueueNotificationFn = jest.fn();

    const result = await runDeadlineReminder({
      getTasksFn,
      getUserFn,
      enqueueNotificationFn,
      processQueueFn: jest.fn(),
      reminderRegistry: new DeadlineReminderRegistry(),
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(result.skipped_without_email).toBe(1);
    expect(enqueueNotificationFn).not.toHaveBeenCalled();
  });

  test('continues after one recipient lookup fails', async () => {
    const getTasksFn = jest.fn().mockResolvedValue(
      createSinglePageResponse([
        createTask({
          id: 1,
          assigned_to: 3,
        }),
        createTask({
          id: 2,
          assigned_to: 4,
          due_date: '2026-08-03T18:00:00.000Z',
        }),
      ]),
    );

    const getUserFn = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('Laravel timeout.'), {
          code: 'LARAVEL_TIMEOUT',
        }),
      )
      .mockResolvedValueOnce({
        data: {
          user: {
            id: 4,
            email: 'second@test.com',
          },
        },
      });

    const enqueueNotificationFn = jest.fn();
    const processQueueFn = jest.fn().mockResolvedValue();

    const result = await runDeadlineReminder({
      getTasksFn,
      getUserFn,
      enqueueNotificationFn,
      processQueueFn,
      reminderRegistry: new DeadlineReminderRegistry(),
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(result.failed_reminders).toBe(1);
    expect(result.queued_reminders).toBe(1);
    expect(enqueueNotificationFn).toHaveBeenCalledTimes(1);
    expect(processQueueFn).toHaveBeenCalledTimes(1);
  });

  test('does not process the queue when no reminder is queued', async () => {
    const getTasksFn = jest.fn().mockResolvedValue(
      createSinglePageResponse([
        createTask({
          due_date: '2026-08-10T00:00:00.000Z',
        }),
      ]),
    );

    const processQueueFn = jest.fn();

    const result = await runDeadlineReminder({
      getTasksFn,
      getUserFn: jest.fn(),
      enqueueNotificationFn: jest.fn(),
      processQueueFn,
      reminderRegistry: new DeadlineReminderRegistry(),
      loggerInstance: createLogger(),
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(result.queued_reminders).toBe(0);
    expect(processQueueFn).not.toHaveBeenCalled();
  });

  test('logs reminder job statistics', async () => {
    const getTasksFn = jest
      .fn()
      .mockResolvedValue(createSinglePageResponse([createTask()]));

    const loggerInstance = createLogger();

    const result = await runDeadlineReminder({
      getTasksFn,
      getUserFn: jest.fn().mockResolvedValue({
        data: {
          user: {
            id: 3,
            email: 'member@test.com',
          },
        },
      }),
      enqueueNotificationFn: jest.fn(),
      processQueueFn: jest.fn().mockResolvedValue(),
      reminderRegistry: new DeadlineReminderRegistry(),
      loggerInstance,
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(loggerInstance.info).toHaveBeenCalledWith(
      {
        reminder: result,
        range_days: 1,
        generated_at: '2026-08-03T00:00:00.000Z',
      },
      'Deadline reminder job completed.',
    );
  });

  test('reminder registry removes old entries', () => {
    const registry = new DeadlineReminderRegistry();

    registry.add('old', new Date('2026-08-01T00:00:00.000Z'));

    registry.add('recent', new Date('2026-08-03T00:00:00.000Z'));

    expect(registry.removeOlderThan(new Date('2026-08-02T00:00:00.000Z'))).toBe(
      1,
    );

    expect(registry.has('old')).toBe(false);
    expect(registry.has('recent')).toBe(true);
  });

  test('reminder registry clear returns removed count', () => {
    const registry = new DeadlineReminderRegistry();

    registry.add('first');
    registry.add('second');

    expect(registry.clear()).toBe(2);
    expect(registry.size()).toBe(0);
  });
});
