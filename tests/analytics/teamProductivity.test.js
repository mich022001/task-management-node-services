import { buildTeamProductivity } from '../../src/services/analytics.service.js';

const currentTime = new Date('2026-08-02T12:00:00.000Z');

function createTeam(overrides = {}) {
  return {
    id: 1,
    name: 'Engineering',
    members: [
      {
        id: 2,
        name: 'Team Manager',
        email: 'manager@test.com',
        role: 'manager',
        is_active: true,
        member_role: 'lead',
      },
      {
        id: 3,
        name: 'Team Member',
        email: 'member@test.com',
        role: 'team_member',
        is_active: true,
        member_role: 'member',
      },
    ],
    ...overrides,
  };
}

function createTask(overrides = {}) {
  return {
    id: 1,
    team_id: 1,
    title: 'Test task',
    status: 'pending',
    priority: 'medium',
    assigned_to: 3,
    created_by: 2,
    due_date: null,
    created_at: '2026-08-01T12:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

describe('Team productivity analytics', () => {
  test('returns basic team information', () => {
    const result = buildTeamProductivity(createTeam(), [], {
      now: currentTime,
    });

    expect(result.team).toEqual({
      id: 1,
      name: 'Engineering',
    });
  });

  test('counts total team tasks', () => {
    const tasks = [
      createTask({ id: 1 }),
      createTask({ id: 2 }),
      createTask({ id: 3 }),
    ];

    const result = buildTeamProductivity(createTeam(), tasks, {
      now: currentTime,
    });

    expect(result.summary.total_tasks).toBe(3);
  });

  test('counts team tasks by status', () => {
    const tasks = [
      createTask({
        id: 1,
        status: 'pending',
      }),
      createTask({
        id: 2,
        status: 'in_progress',
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

    const result = buildTeamProductivity(createTeam(), tasks, {
      now: currentTime,
    });

    expect(result.summary).toMatchObject({
      total_tasks: 5,
      pending_tasks: 1,
      in_progress_tasks: 2,
      completed_tasks: 1,
      cancelled_tasks: 1,
    });
  });

  test('counts overdue incomplete team tasks', () => {
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
        due_date: '2026-08-10T12:00:00.000Z',
      }),
      createTask({
        id: 4,
        status: 'completed',
        due_date: '2026-07-20T12:00:00.000Z',
      }),
    ];

    const result = buildTeamProductivity(createTeam(), tasks, {
      now: currentTime,
    });

    expect(result.summary.overdue_tasks).toBe(2);
  });

  test('calculates the team completion rate', () => {
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

    const result = buildTeamProductivity(createTeam(), tasks, {
      now: currentTime,
    });

    expect(result.summary.completion_rate).toBe(66.67);
  });

  test('returns zero completion rate for a team with no tasks', () => {
    const result = buildTeamProductivity(createTeam(), [], {
      now: currentTime,
    });

    expect(result.summary).toEqual({
      total_tasks: 0,
      pending_tasks: 0,
      in_progress_tasks: 0,
      completed_tasks: 0,
      cancelled_tasks: 0,
      overdue_tasks: 0,
      completion_rate: 0,
      average_completion_days: 0,
      average_completion_days_by_priority: {
        low: 0,
        medium: 0,
        high: 0,
      },
    });
  });

  test('returns a productivity record for every team member', () => {
    const result = buildTeamProductivity(createTeam(), [], {
      now: currentTime,
    });

    expect(result.members).toHaveLength(2);

    expect(result.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 2,
          name: 'Team Manager',
          member_role: 'lead',
        }),
        expect.objectContaining({
          user_id: 3,
          name: 'Team Member',
          member_role: 'member',
        }),
      ]),
    );
  });

  test('counts assigned tasks per member', () => {
    const tasks = [
      createTask({
        id: 1,
        assigned_to: 3,
      }),
      createTask({
        id: 2,
        assigned_to: 3,
      }),
      createTask({
        id: 3,
        assigned_to: 2,
      }),
    ];

    const result = buildTeamProductivity(createTeam(), tasks, {
      now: currentTime,
    });

    const manager = result.members.find((member) => member.user_id === 2);

    const member = result.members.find((item) => item.user_id === 3);

    expect(manager.assigned_tasks).toBe(1);
    expect(member.assigned_tasks).toBe(2);
  });

  test('counts completed tasks per member', () => {
    const tasks = [
      createTask({
        id: 1,
        assigned_to: 3,
        status: 'completed',
      }),
      createTask({
        id: 2,
        assigned_to: 3,
        status: 'pending',
      }),
      createTask({
        id: 3,
        assigned_to: 2,
        status: 'completed',
      }),
    ];

    const result = buildTeamProductivity(createTeam(), tasks, {
      now: currentTime,
    });

    const manager = result.members.find((member) => member.user_id === 2);

    const member = result.members.find((item) => item.user_id === 3);

    expect(manager.completed_tasks).toBe(1);
    expect(member.completed_tasks).toBe(1);
  });

  test('calculates completion rate per member', () => {
    const tasks = [
      createTask({
        id: 1,
        assigned_to: 3,
        status: 'completed',
      }),
      createTask({
        id: 2,
        assigned_to: 3,
        status: 'completed',
      }),
      createTask({
        id: 3,
        assigned_to: 3,
        status: 'pending',
      }),
    ];

    const result = buildTeamProductivity(createTeam(), tasks, {
      now: currentTime,
    });

    const member = result.members.find((item) => item.user_id === 3);

    expect(member.completion_rate).toBe(66.67);
  });

  test('returns zero rate for members without assigned tasks', () => {
    const tasks = [
      createTask({
        id: 1,
        assigned_to: 3,
        status: 'completed',
      }),
    ];

    const result = buildTeamProductivity(createTeam(), tasks, {
      now: currentTime,
    });

    const manager = result.members.find((member) => member.user_id === 2);

    expect(manager.assigned_tasks).toBe(0);
    expect(manager.completed_tasks).toBe(0);
    expect(manager.completion_rate).toBe(0);
  });

  test('reports team completion duration metrics by priority', () => {
    const tasks = [
      createTask({
        id: 1,
        status: 'completed',
        priority: 'low',
        created_at: '2026-08-01T00:00:00.000Z',
        completed_at: '2026-08-02T00:00:00.000Z',
      }),
      createTask({
        id: 2,
        status: 'completed',
        priority: 'high',
        created_at: '2026-08-01T00:00:00.000Z',
        completed_at: '2026-08-05T00:00:00.000Z',
      }),
    ];

    const result = buildTeamProductivity(createTeam(), tasks, {
      now: currentTime,
    });

    expect(result.summary.average_completion_days).toBe(2.5);

    expect(result.summary.average_completion_days_by_priority).toEqual({
      low: 1,
      medium: 0,
      high: 4,
    });
  });

  test('reports assigned task priority counts per member', () => {
    const tasks = [
      createTask({
        id: 1,
        assigned_to: 3,
        priority: 'low',
      }),
      createTask({
        id: 2,
        assigned_to: 3,
        priority: 'high',
      }),
      createTask({
        id: 3,
        assigned_to: 3,
        priority: 'high',
      }),
    ];

    const result = buildTeamProductivity(createTeam(), tasks, {
      now: currentTime,
    });

    const member = result.members.find((item) => item.user_id === 3);

    expect(member.priority).toEqual({
      low: 1,
      medium: 0,
      high: 2,
    });
  });

  test('reports completion duration metrics per member', () => {
    const tasks = [
      createTask({
        id: 1,
        assigned_to: 3,
        status: 'completed',
        priority: 'medium',
        created_at: '2026-08-01T00:00:00.000Z',
        completed_at: '2026-08-03T00:00:00.000Z',
      }),
      createTask({
        id: 2,
        assigned_to: 3,
        status: 'completed',
        priority: 'medium',
        created_at: '2026-08-01T00:00:00.000Z',
        completed_at: '2026-08-05T00:00:00.000Z',
      }),
    ];

    const result = buildTeamProductivity(createTeam(), tasks, {
      now: currentTime,
    });

    const member = result.members.find((item) => item.user_id === 3);

    expect(member.average_completion_days).toBe(3);

    expect(member.average_completion_days_by_priority).toEqual({
      low: 0,
      medium: 3,
      high: 0,
    });
  });

  test('ignores tasks belonging to another team', () => {
    const tasks = [
      createTask({
        id: 1,
        team_id: 1,
        status: 'completed',
      }),
      createTask({
        id: 2,
        team_id: 2,
        status: 'completed',
      }),
    ];

    const result = buildTeamProductivity(
      createTeam({
        id: 1,
      }),
      tasks,
      {
        now: currentTime,
      },
    );

    expect(result.summary.total_tasks).toBe(1);
    expect(result.summary.completed_tasks).toBe(1);
  });

  test('supports a team without a members property', () => {
    const team = {
      id: 1,
      name: 'Engineering',
    };

    const result = buildTeamProductivity(team, [], {
      now: currentTime,
    });

    expect(result.members).toEqual([]);
  });

  test('does not mutate team or task input data', () => {
    const team = createTeam();

    const tasks = [
      createTask({
        id: 1,
        status: 'completed',
      }),
    ];

    const originalTeam = structuredClone(team);
    const originalTasks = structuredClone(tasks);

    buildTeamProductivity(team, tasks, {
      now: currentTime,
    });

    expect(team).toEqual(originalTeam);
    expect(tasks).toEqual(originalTasks);
  });
});
