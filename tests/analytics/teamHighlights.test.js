import { buildTeamHighlights } from '../../src/services/analytics.service.js';

const now = new Date('2026-08-10T00:00:00.000Z');

const teams = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Team-1',
    members: [
      { id: 'member-1' },
      { id: 'member-2' },
      { id: 'member-3' },
    ],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Team-2',
    members_count: 5,
  },
];

function createTask(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    team_id: teams[0].id,
    title: 'Task',
    status: 'pending',
    priority: 'medium',
    assigned_to: 'member-1',
    created_at: '2026-08-01T00:00:00.000Z',
    due_date: '2026-08-20T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

describe('Team highlights analytics', () => {
  test('returns one summary for every team', () => {
    const result = buildTeamHighlights(teams, [], { now });

    expect(result.teams).toHaveLength(2);

    expect(result.teams[0]).toMatchObject({
      team_id: teams[0].id,
      team_name: 'Team-1',
      member_count: 3,
    });

    expect(result.teams[1].member_count).toBe(5);
  });

  test('reports exact task status counts', () => {
    const tasks = [
      createTask({ status: 'pending' }),
      createTask({ status: 'pending' }),
      createTask({ status: 'in_progress' }),
      createTask({
        status: 'completed',
        completed_at: '2026-08-03T00:00:00.000Z',
      }),
      createTask({ status: 'cancelled' }),
    ];

    const result = buildTeamHighlights(teams, tasks, { now });
    const summary = result.teams[0];

    expect(summary).toMatchObject({
      total_tasks: 5,
      status: {
        yet_to_start: 2,
        in_progress: 1,
        completed: 1,
        cancelled: 1,
      },
    });
  });

  test('reports low, medium, and high priority workload', () => {
    const tasks = [
      createTask({ priority: 'low' }),
      createTask({ priority: 'medium' }),
      createTask({ priority: 'medium' }),
      createTask({ priority: 'high' }),
      createTask({ priority: 'high' }),
    ];

    const result = buildTeamHighlights(teams, tasks, { now });

    expect(result.teams[0].priority).toEqual({
      low: 1,
      medium: 2,
      high: 2,
    });
  });

  test('reports critical high-priority risk by status', () => {
    const tasks = [
      createTask({
        status: 'pending',
        priority: 'high',
      }),
      createTask({
        status: 'pending',
        priority: 'high',
        due_date: '2026-08-01T00:00:00.000Z',
      }),
      createTask({
        status: 'in_progress',
        priority: 'high',
        due_date: '2026-08-20T00:00:00.000Z',
      }),
      createTask({
        status: 'completed',
        priority: 'high',
        completed_at: '2026-08-05T00:00:00.000Z',
      }),
      createTask({
        status: 'cancelled',
        priority: 'high',
      }),
    ];

    const result = buildTeamHighlights(teams, tasks, { now });

    expect(result.teams[0].high_priority).toEqual({
      yet_to_start: 2,
      in_progress: 1,
      completed: 1,
      cancelled: 1,
      overdue: 1,
    });
  });

  test('counts all overdue unfinished tasks', () => {
    const tasks = [
      createTask({
        status: 'pending',
        due_date: '2026-08-01T00:00:00.000Z',
      }),
      createTask({
        status: 'in_progress',
        due_date: '2026-08-02T00:00:00.000Z',
      }),
      createTask({
        status: 'completed',
        due_date: '2026-08-01T00:00:00.000Z',
        completed_at: '2026-08-03T00:00:00.000Z',
      }),
    ];

    const result = buildTeamHighlights(teams, tasks, { now });

    expect(result.teams[0].overdue_tasks).toBe(2);
  });

  test('calculates completion rate and average completion time', () => {
    const tasks = [
      createTask({
        status: 'completed',
        created_at: '2026-08-01T00:00:00.000Z',
        completed_at: '2026-08-03T00:00:00.000Z',
      }),
      createTask({
        status: 'pending',
      }),
    ];

    const result = buildTeamHighlights(teams, tasks, { now });

    expect(result.teams[0]).toMatchObject({
      completion_rate: 50,
      average_completion_days: 2,
    });
  });

  test('ignores tasks belonging to unknown teams', () => {
    const tasks = [
      createTask({
        team_id: '99999999-9999-4999-8999-999999999999',
      }),
    ];

    const result = buildTeamHighlights(teams, tasks, { now });

    expect(result.teams[0].total_tasks).toBe(0);
    expect(result.teams[1].total_tasks).toBe(0);
  });

  test('does not mutate team or task input', () => {
    const tasks = [createTask()];
    const originalTeams = structuredClone(teams);
    const originalTasks = structuredClone(tasks);

    buildTeamHighlights(teams, tasks, { now });

    expect(teams).toEqual(originalTeams);
    expect(tasks).toEqual(originalTasks);
  });
});
