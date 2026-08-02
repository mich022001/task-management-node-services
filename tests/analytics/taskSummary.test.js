import { buildTaskSummary } from '../../src/services/analytics.service.js';

const currentTime = new Date('2026-08-02T12:00:00.000Z');

function createTask(overrides = {}) {
  return {
    id: 1,
    team_id: 1,
    title: 'Test task',
    status: 'pending',
    priority: 'medium',
    due_date: null,
    completed_at: null,
    ...overrides,
  };
}

describe('Task summary analytics', () => {
  test('counts total tasks', () => {
    const tasks = [
      createTask({ id: 1 }),
      createTask({ id: 2 }),
      createTask({ id: 3 }),
    ];

    const result = buildTaskSummary(tasks, {
      now: currentTime,
    });

    expect(result.total_tasks).toBe(3);
  });

  test('counts tasks by status', () => {
    const tasks = [
      createTask({
        id: 1,
        status: 'pending',
      }),
      createTask({
        id: 2,
        status: 'pending',
      }),
      createTask({
        id: 3,
        status: 'in_progress',
      }),
      createTask({
        id: 4,
        status: 'completed',
      }),
      createTask({
        id: 5,
        status: 'cancelled',
      }),
    ];

    const result = buildTaskSummary(tasks, {
      now: currentTime,
    });

    expect(result.status).toEqual({
      pending: 2,
      in_progress: 1,
      completed: 1,
      cancelled: 1,
    });
  });

  test('counts tasks by priority', () => {
    const tasks = [
      createTask({
        id: 1,
        priority: 'low',
      }),
      createTask({
        id: 2,
        priority: 'medium',
      }),
      createTask({
        id: 3,
        priority: 'medium',
      }),
      createTask({
        id: 4,
        priority: 'high',
      }),
    ];

    const result = buildTaskSummary(tasks, {
      now: currentTime,
    });

    expect(result.priority).toEqual({
      low: 1,
      medium: 2,
      high: 1,
    });
  });

  test('counts completed tasks', () => {
    const tasks = [
      createTask({
        id: 1,
        status: 'completed',
      }),
      createTask({
        id: 2,
        status: 'completed',
      }),
      createTask({
        id: 3,
        status: 'pending',
      }),
    ];

    const result = buildTaskSummary(tasks, {
      now: currentTime,
    });

    expect(result.completed_tasks).toBe(2);
  });

  test('counts overdue incomplete tasks', () => {
    const tasks = [
      createTask({
        id: 1,
        status: 'pending',
        due_date: '2026-08-01T12:00:00.000Z',
      }),
      createTask({
        id: 2,
        status: 'in_progress',
        due_date: '2026-07-30T12:00:00.000Z',
      }),
      createTask({
        id: 3,
        status: 'pending',
        due_date: '2026-08-05T12:00:00.000Z',
      }),
    ];

    const result = buildTaskSummary(tasks, {
      now: currentTime,
    });

    expect(result.overdue_tasks).toBe(2);
  });

  test('does not count completed or cancelled tasks as overdue', () => {
    const tasks = [
      createTask({
        id: 1,
        status: 'completed',
        due_date: '2026-07-30T12:00:00.000Z',
      }),
      createTask({
        id: 2,
        status: 'cancelled',
        due_date: '2026-07-30T12:00:00.000Z',
      }),
    ];

    const result = buildTaskSummary(tasks, {
      now: currentTime,
    });

    expect(result.overdue_tasks).toBe(0);
  });

  test('ignores tasks without valid due dates when counting overdue tasks', () => {
    const tasks = [
      createTask({
        id: 1,
        due_date: null,
      }),
      createTask({
        id: 2,
        due_date: 'invalid-date',
      }),
    ];

    const result = buildTaskSummary(tasks, {
      now: currentTime,
    });

    expect(result.overdue_tasks).toBe(0);
  });

  test('calculates completion rate', () => {
    const tasks = [
      createTask({
        id: 1,
        status: 'completed',
      }),
      createTask({
        id: 2,
        status: 'completed',
      }),
      createTask({
        id: 3,
        status: 'pending',
      }),
    ];

    const result = buildTaskSummary(tasks, {
      now: currentTime,
    });

    expect(result.completion_rate).toBe(66.67);
  });

  test('returns zero completion rate when there are no tasks', () => {
    const result = buildTaskSummary([], {
      now: currentTime,
    });

    expect(result).toEqual({
      total_tasks: 0,
      status: {
        pending: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
      },
      priority: {
        low: 0,
        medium: 0,
        high: 0,
      },
      completed_tasks: 0,
      overdue_tasks: 0,
      completion_rate: 0,
    });
  });

  test('filters tasks by one authorized team', () => {
    const tasks = [
      createTask({
        id: 1,
        team_id: 1,
        status: 'completed',
      }),
      createTask({
        id: 2,
        team_id: 2,
        status: 'pending',
      }),
    ];

    const result = buildTaskSummary(tasks, {
      teamIds: [1],
      now: currentTime,
    });

    expect(result.total_tasks).toBe(1);
    expect(result.completed_tasks).toBe(1);
    expect(result.status.pending).toBe(0);
  });

  test('filters tasks by multiple authorized teams', () => {
    const tasks = [
      createTask({
        id: 1,
        team_id: 1,
      }),
      createTask({
        id: 2,
        team_id: 2,
      }),
      createTask({
        id: 3,
        team_id: 3,
      }),
    ];

    const result = buildTaskSummary(tasks, {
      teamIds: [1, 3],
      now: currentTime,
    });

    expect(result.total_tasks).toBe(2);
  });

  test('returns no tasks when authorized team list is empty', () => {
    const tasks = [
      createTask({
        id: 1,
        team_id: 1,
      }),
    ];

    const result = buildTaskSummary(tasks, {
      teamIds: [],
      now: currentTime,
    });

    expect(result.total_tasks).toBe(0);
    expect(result.completion_rate).toBe(0);
  });

  test('does not allow callers to mutate the input task array', () => {
    const tasks = [
      createTask({
        id: 1,
        status: 'completed',
      }),
    ];

    const originalTasks = structuredClone(tasks);

    buildTaskSummary(tasks, {
      now: currentTime,
    });

    expect(tasks).toEqual(originalTasks);
  });
});
