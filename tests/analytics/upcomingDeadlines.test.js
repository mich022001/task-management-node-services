import { buildUpcomingDeadlines } from '../../src/services/analytics.service.js';

const currentTime = new Date('2026-08-02T12:00:00.000Z');

function createTask(overrides = {}) {
  return {
    id: 1,
    team_id: 1,
    title: 'Test task',
    status: 'pending',
    priority: 'medium',
    assigned_to: 3,
    due_date: '2026-08-05T12:00:00.000Z',
    ...overrides,
  };
}

describe('Upcoming deadline analytics', () => {
  test('uses a default seven-day range', () => {
    const result = buildUpcomingDeadlines([], {
      now: currentTime,
    });

    expect(result.range_days).toBe(7);
  });

  test('returns tasks due within the configured range', () => {
    const tasks = [
      createTask({
        id: 1,
        due_date: '2026-08-03T12:00:00.000Z',
      }),
      createTask({
        id: 2,
        due_date: '2026-08-09T12:00:00.000Z',
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      days: 7,
      now: currentTime,
    });

    expect(result.upcoming.map((task) => task.id)).toEqual([1, 2]);
  });

  test('includes a task due exactly at the range boundary', () => {
    const tasks = [
      createTask({
        id: 1,
        due_date: '2026-08-09T12:00:00.000Z',
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      days: 7,
      now: currentTime,
    });

    expect(result.upcoming).toHaveLength(1);
  });

  test('includes a task due exactly at the current time', () => {
    const tasks = [
      createTask({
        id: 1,
        due_date: '2026-08-02T12:00:00.000Z',
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      now: currentTime,
    });

    expect(result.overdue).toHaveLength(0);
    expect(result.upcoming).toHaveLength(1);
  });

  test('excludes tasks outside the configured range', () => {
    const tasks = [
      createTask({
        id: 1,
        due_date: '2026-08-10T12:00:00.000Z',
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      days: 7,
      now: currentTime,
    });

    expect(result.upcoming).toEqual([]);
  });

  test('separates overdue tasks from upcoming tasks', () => {
    const tasks = [
      createTask({
        id: 1,
        due_date: '2026-08-01T12:00:00.000Z',
      }),
      createTask({
        id: 2,
        due_date: '2026-08-04T12:00:00.000Z',
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      now: currentTime,
    });

    expect(result.overdue.map((task) => task.id)).toEqual([1]);

    expect(result.upcoming.map((task) => task.id)).toEqual([2]);
  });

  test('excludes completed tasks', () => {
    const tasks = [
      createTask({
        id: 1,
        status: 'completed',
        due_date: '2026-08-03T12:00:00.000Z',
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      now: currentTime,
    });

    expect(result.overdue).toEqual([]);
    expect(result.upcoming).toEqual([]);
  });

  test('excludes cancelled tasks', () => {
    const tasks = [
      createTask({
        id: 1,
        status: 'cancelled',
        due_date: '2026-08-03T12:00:00.000Z',
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      now: currentTime,
    });

    expect(result.overdue).toEqual([]);
    expect(result.upcoming).toEqual([]);
  });

  test('excludes tasks without a due date', () => {
    const tasks = [
      createTask({
        id: 1,
        due_date: null,
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      now: currentTime,
    });

    expect(result.overdue).toEqual([]);
    expect(result.upcoming).toEqual([]);
  });

  test('excludes tasks with an invalid due date', () => {
    const tasks = [
      createTask({
        id: 1,
        due_date: 'invalid-date',
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      now: currentTime,
    });

    expect(result.overdue).toEqual([]);
    expect(result.upcoming).toEqual([]);
  });

  test('sorts upcoming tasks by nearest due date', () => {
    const tasks = [
      createTask({
        id: 1,
        due_date: '2026-08-07T12:00:00.000Z',
      }),
      createTask({
        id: 2,
        due_date: '2026-08-03T12:00:00.000Z',
      }),
      createTask({
        id: 3,
        due_date: '2026-08-05T12:00:00.000Z',
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      days: 7,
      now: currentTime,
    });

    expect(result.upcoming.map((task) => task.id)).toEqual([2, 3, 1]);
  });

  test('sorts overdue tasks from oldest to newest due date', () => {
    const tasks = [
      createTask({
        id: 1,
        due_date: '2026-08-01T12:00:00.000Z',
      }),
      createTask({
        id: 2,
        due_date: '2026-07-25T12:00:00.000Z',
      }),
      createTask({
        id: 3,
        due_date: '2026-07-30T12:00:00.000Z',
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      now: currentTime,
    });

    expect(result.overdue.map((task) => task.id)).toEqual([2, 3, 1]);
  });

  test('filters deadlines by one authorized team', () => {
    const tasks = [
      createTask({
        id: 1,
        team_id: 1,
      }),
      createTask({
        id: 2,
        team_id: 2,
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      teamIds: [1],
      now: currentTime,
    });

    expect(result.upcoming.map((task) => task.id)).toEqual([1]);
  });

  test('filters deadlines by multiple authorized teams', () => {
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

    const result = buildUpcomingDeadlines(tasks, {
      teamIds: [1, 3],
      now: currentTime,
    });

    expect(result.upcoming.map((task) => task.id)).toEqual([1, 3]);
  });

  test('returns no deadlines when the authorized team list is empty', () => {
    const tasks = [
      createTask({
        id: 1,
        team_id: 1,
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      teamIds: [],
      now: currentTime,
    });

    expect(result.overdue).toEqual([]);
    expect(result.upcoming).toEqual([]);
  });

  test('returns only the expected deadline fields', () => {
    const tasks = [
      createTask({
        id: 1,
        description: 'Internal description',
        created_by: 2,
      }),
    ];

    const result = buildUpcomingDeadlines(tasks, {
      now: currentTime,
    });

    expect(result.upcoming[0]).toEqual({
      id: 1,
      title: 'Test task',
      team_id: 1,
      assigned_to: 3,
      status: 'pending',
      priority: 'medium',
      due_date: '2026-08-05T12:00:00.000Z',
    });
  });

  test('does not mutate the input task array', () => {
    const tasks = [
      createTask({
        id: 1,
      }),
    ];

    const originalTasks = structuredClone(tasks);

    buildUpcomingDeadlines(tasks, {
      now: currentTime,
    });

    expect(tasks).toEqual(originalTasks);
  });
});
