import { buildTeamReport } from '../../src/services/analytics.service.js';

const team = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Engineering',
  members: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Michael Valenzuela',
      email: 'michael@example.com',
      member_role: 'member',
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Second Member',
      email: 'second@example.com',
      member_role: 'member',
    },
  ],
};

function createTask(overrides = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    team_id: team.id,
    title: 'Prepare report',
    description: 'Prepare the task report.',
    status: 'pending',
    priority: 'medium',
    assigned_to: team.members[0].id,
    created_at: '2026-08-01T08:00:00.000Z',
    due_date: '2026-08-05T08:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

describe('Team report analytics', () => {
  test('returns team identity and every team member', () => {
    const report = buildTeamReport(team, []);

    expect(report.team).toEqual({
      id: team.id,
      name: team.name,
    });

    expect(report.members).toHaveLength(2);
  });

  test('groups assigned tasks under the correct member', () => {
    const task = createTask();

    const report = buildTeamReport(team, [task]);

    expect(report.members[0].tasks).toHaveLength(1);
    expect(report.members[0].tasks[0].id).toBe(task.id);
    expect(report.members[1].tasks).toHaveLength(0);
  });

  test('separates unassigned tasks', () => {
    const task = createTask({
      assigned_to: null,
    });

    const report = buildTeamReport(team, [task]);

    expect(report.unassigned_tasks).toHaveLength(1);
    expect(report.unassigned_tasks[0].id).toBe(task.id);
  });

  test('counts completed, unfinished, cancelled, and overdue tasks', () => {
    const report = buildTeamReport(
      team,
      [
        createTask({
          id: 'completed',
          status: 'completed',
          completed_at: '2026-08-03T08:00:00.000Z',
        }),
        createTask({
          id: 'pending',
          status: 'pending',
          due_date: '2026-08-01T00:00:00.000Z',
        }),
        createTask({
          id: 'in-progress',
          status: 'in_progress',
          due_date: '2026-08-10T00:00:00.000Z',
        }),
        createTask({
          id: 'cancelled',
          status: 'cancelled',
        }),
      ],
      {
        now: new Date('2026-08-03T00:00:00.000Z'),
      },
    );

    expect(report.summary).toMatchObject({
      total_tasks: 4,
      completed_tasks: 1,
      unfinished_tasks: 2,
      cancelled_tasks: 1,
      overdue_tasks: 1,
      completion_rate: 25,
    });
  });

  test('filters tasks by selected members', () => {
    const report = buildTeamReport(
      team,
      [
        createTask({
          id: 'first-member-task',
        }),
        createTask({
          id: 'second-member-task',
          assigned_to: team.members[1].id,
        }),
      ],
      {
        memberIds: [team.members[1].id],
      },
    );

    expect(report.members).toHaveLength(1);
    expect(report.members[0].user_id).toBe(team.members[1].id);
    expect(report.summary.total_tasks).toBe(1);
  });

  test('filters tasks by due date inclusively', () => {
    const report = buildTeamReport(
      team,
      [
        createTask({
          id: 'lower-bound',
          due_date: '2026-08-01T00:00:00.000Z',
        }),
        createTask({
          id: 'upper-bound',
          due_date: '2026-08-31T23:59:59.999Z',
        }),
        createTask({
          id: 'outside',
          due_date: '2026-09-01T00:00:00.000Z',
        }),
      ],
      {
        dateField: 'due_date',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
      },
    );

    expect(report.summary.total_tasks).toBe(2);
  });

  test('filters using created_at when requested', () => {
    const report = buildTeamReport(
      team,
      [
        createTask({
          id: 'inside',
          created_at: '2026-08-15T00:00:00.000Z',
        }),
        createTask({
          id: 'outside',
          created_at: '2026-07-31T23:59:59.999Z',
        }),
      ],
      {
        dateField: 'created_at',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
      },
    );

    expect(report.summary.total_tasks).toBe(1);
  });

  test('filters by status and priority', () => {
    const report = buildTeamReport(
      team,
      [
        createTask({
          id: 'included',
          status: 'completed',
          priority: 'high',
          completed_at: '2026-08-02T08:00:00.000Z',
        }),
        createTask({
          id: 'wrong-status',
          status: 'pending',
          priority: 'high',
        }),
        createTask({
          id: 'wrong-priority',
          status: 'completed',
          priority: 'low',
          completed_at: '2026-08-02T08:00:00.000Z',
        }),
      ],
      {
        statuses: ['completed'],
        priorities: ['high'],
      },
    );

    expect(report.summary.total_tasks).toBe(1);
    expect(report.members[0].tasks[0].id).toBe('included');
  });

  test('does not mutate team or task input', () => {
    const tasks = [createTask()];
    const originalTeam = structuredClone(team);
    const originalTasks = structuredClone(tasks);

    buildTeamReport(team, tasks);

    expect(team).toEqual(originalTeam);
    expect(tasks).toEqual(originalTasks);
  });
});

describe('unified team report analytics', () => {
  test('includes exact status and priority totals', () => {
    const team = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Engineering',
      members: [],
    };

    const tasks = [
      {
        id: 'task-1',
        team_id: team.id,
        assigned_to: null,
        title: 'Pending medium issue',
        description: null,
        status: 'pending',
        priority: 'medium',
        created_at: '2026-08-01T00:00:00.000Z',
        due_date: '2099-08-10T00:00:00.000Z',
        completed_at: null,
      },
      {
        id: 'task-2',
        team_id: team.id,
        assigned_to: null,
        title: 'Completed high issue',
        description: null,
        status: 'completed',
        priority: 'high',
        created_at: '2026-08-01T00:00:00.000Z',
        due_date: '2099-08-05T00:00:00.000Z',
        completed_at: '2026-08-02T00:00:00.000Z',
      },
      {
        id: 'task-3',
        team_id: team.id,
        assigned_to: null,
        title: 'Cancelled low issue',
        description: null,
        status: 'cancelled',
        priority: 'low',
        created_at: '2026-08-01T00:00:00.000Z',
        due_date: '2099-08-05T00:00:00.000Z',
        completed_at: null,
      },
    ];

    const report = buildTeamReport(team, tasks, {
      now: new Date('2026-08-04T00:00:00.000Z'),
    });

    expect(report.summary).toMatchObject({
      total_tasks: 3,
      pending_tasks: 1,
      yet_to_start_tasks: 1,
      in_progress_tasks: 0,
      completed_tasks: 1,
      cancelled_tasks: 1,
      overdue_tasks: 0,
      status: {
        pending: 1,
        yet_to_start: 1,
        in_progress: 0,
        completed: 1,
        cancelled: 1,
      },
      priority: {
        low: 1,
        medium: 1,
        high: 1,
      },
      completion_rate: 33.33,
    });
  });

  test('includes seven-day deadline collections', () => {
    const team = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Engineering',
      members: [],
    };

    const tasks = [
      {
        id: 'overdue-task',
        team_id: team.id,
        assigned_to: null,
        title: 'Overdue issue',
        description: null,
        status: 'pending',
        priority: 'high',
        created_at: '2026-08-01T00:00:00.000Z',
        due_date: '2026-08-03T00:00:00.000Z',
        completed_at: null,
      },
      {
        id: 'upcoming-task',
        team_id: team.id,
        assigned_to: null,
        title: 'Upcoming issue',
        description: null,
        status: 'in_progress',
        priority: 'medium',
        created_at: '2026-08-01T00:00:00.000Z',
        due_date: '2026-08-07T00:00:00.000Z',
        completed_at: null,
      },
    ];

    const report = buildTeamReport(team, tasks, {
      now: new Date('2026-08-04T00:00:00.000Z'),
    });

    expect(report.deadlines.range_days).toBe(7);
    expect(report.deadlines.overdue).toHaveLength(1);
    expect(report.deadlines.upcoming).toHaveLength(1);
  });
});
