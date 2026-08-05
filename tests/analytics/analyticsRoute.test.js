import { jest } from '@jest/globals';
import request from 'supertest';

const getTasksMock = jest.fn();
const getTaskMock = jest.fn();
const getTeamMock = jest.fn();
const getTeamsMock = jest.fn();

const getAuthorizedTeamIdsMock = jest.fn();
const assertTeamAccessMock = jest.fn();
const resolveAnalyticsTeamIdsMock = jest.fn();

jest.unstable_mockModule('../../src/clients/laravel/taskClient.js', () => ({
  getTasks: getTasksMock,
  getTask: getTaskMock,
}));

jest.unstable_mockModule('../../src/clients/laravel/teamClient.js', () => ({
  getTeam: getTeamMock,
  getTeams: getTeamsMock,
}));

jest.unstable_mockModule(
  '../../src/services/analyticsAuthorization.service.js',
  () => ({
    getAuthorizedTeamIds: getAuthorizedTeamIdsMock,
    assertTeamAccess: assertTeamAccessMock,
    resolveAnalyticsTeamIds: resolveAnalyticsTeamIdsMock,
  }),
);

const { default: app } = await import('../../src/app.js');

const { clearAnalyticsCache } =
  await import('../../src/cache/analytics.cache.js');

const { AppError } = await import('../../src/errors/AppError.js');
const { createToken } = await import('../helpers/jwt.js');

function createTask(overrides = {}) {
  return {
    id: 1,
    team_id: 1,
    title: 'Test task',
    description: 'Test description',
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

function createTeam(overrides = {}) {
  return {
    id: 1,
    name: 'Engineering',
    creator: {
      id: 2,
      name: 'Team Manager',
      email: 'manager@test.com',
      role: 'manager',
      is_active: true,
    },
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

describe('Analytics routes', () => {
  beforeEach(() => {
    clearAnalyticsCache();

    getTasksMock.mockReset();
    getTaskMock.mockReset();
    getTeamMock.mockReset();
    getTeamsMock.mockReset();

    getAuthorizedTeamIdsMock.mockReset();
    assertTeamAccessMock.mockReset();
    resolveAnalyticsTeamIdsMock.mockReset();

    getAuthorizedTeamIdsMock.mockResolvedValue(undefined);

    resolveAnalyticsTeamIdsMock.mockImplementation(
      ({ authenticatedUser, requestedTeamId, authorizedTeamIds }) => {
        if (authenticatedUser.role === 'admin') {
          return requestedTeamId === undefined
            ? undefined
            : [Number(requestedTeamId)];
        }

        if (requestedTeamId !== undefined) {
          return [Number(requestedTeamId)];
        }

        return authorizedTeamIds ?? [];
      },
    );

    getTasksMock.mockResolvedValue({
      data: [],
      meta: {
        current_page: 1,
        per_page: 100,
        total: 0,
        last_page: 1,
      },
    });

    getTeamMock.mockResolvedValue({
      data: {
        team: createTeam(),
      },
    });

    getTeamsMock.mockResolvedValue({
      data: [createTeam()],
      meta: {
        current_page: 1,
        per_page: 100,
        total: 1,
        last_page: 1,
      },
    });
  });

  test('rejects a request without authentication', async () => {
    const response = await request(app).get('/api/v1/analytics/tasks/summary');

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });

    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('returns unified dashboard analytics for a manager', async () => {
    const token = createToken({
      sub: '2',
      role: 'manager',
    });

    getTeamsMock.mockResolvedValue({
      data: [
        createTeam({
          id: '11111111-1111-4111-8111-111111111111',
        }),
      ],
      meta: {
        current_page: 1,
        per_page: 100,
        total: 1,
        last_page: 1,
      },
    });

    getTasksMock.mockResolvedValue({
      data: [
        createTask({
          id: 'task-1',
          team_id: '11111111-1111-4111-8111-111111111111',
          status: 'completed',
          completed_at: '2026-08-02T12:00:00.000Z',
        }),
        createTask({
          id: 'task-2',
          team_id: '11111111-1111-4111-8111-111111111111',
          status: 'pending',
          due_date: '2099-08-05T12:00:00.000Z',
        }),
      ],
      meta: {
        current_page: 1,
        per_page: 100,
        total: 2,
        last_page: 1,
      },
    });

    const response = await request(app)
      .get('/api/v1/analytics/dashboard?days=7')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      message: 'Dashboard analytics retrieved successfully.',
      data: {
        summary: {
          total_tasks: 2,
          completed_tasks: 1,
          completion_rate: 50,
        },
        deadlines: {
          range_days: 7,
        },
        team_highlights: {
          teams: [
            expect.objectContaining({
              team_name: 'Engineering',
              total_tasks: 2,
            }),
          ],
        },
      },
      meta: {
        cached: false,
      },
    });

    expect(getTeamsMock).toHaveBeenCalledTimes(1);
    expect(getTeamsMock).toHaveBeenCalledWith({
      user_id: '2',
      page: 1,
      per_page: 100,
    });

    expect(getTasksMock).toHaveBeenCalledTimes(1);

    expect(getAuthorizedTeamIdsMock).not.toHaveBeenCalled();
  });

  test('returns a personal unified dashboard for a team member', async () => {
    const token = createToken({
      sub: '3',
      role: 'team_member',
    });

    const response = await request(app)
      .get('/api/v1/analytics/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(getTasksMock).toHaveBeenCalledWith({
      assigned_to: '3',
      page: 1,
      per_page: 100,
    });

    expect(getTeamsMock).not.toHaveBeenCalled();

    expect(response.body.data.team_highlights.teams).toEqual([]);
  });

  test('returns task summary for a team member', async () => {
    const token = createToken({
      sub: '3',
      role: 'team_member',
      email: 'member@test.com',
    });

    const response = await request(app)
      .get('/api/v1/analytics/tasks/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(getTasksMock).toHaveBeenCalledTimes(1);

    expect(getTasksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assigned_to: '3',
        page: 1,
        per_page: 100,
      }),
    );
  });

  test('returns task summary for an admin', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    getTasksMock.mockResolvedValue({
      data: [
        createTask({
          id: 1,
          status: 'completed',
          priority: 'high',
        }),
        createTask({
          id: 2,
          status: 'pending',
          priority: 'medium',
        }),
      ],
      meta: {
        current_page: 1,
        per_page: 100,
        total: 2,
        last_page: 1,
      },
    });

    const response = await request(app)
      .get('/api/v1/analytics/tasks/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      message: 'Task summary retrieved successfully.',
      data: {
        total_tasks: 2,
        status: {
          pending: 1,
          in_progress: 0,
          completed: 1,
          cancelled: 0,
        },
        priority: {
          low: 0,
          medium: 1,
          high: 1,
        },
        completed_tasks: 1,
        overdue_tasks: 0,
        completion_rate: 50,
        average_completion_days: 0,
        average_completion_days_by_priority: {
          low: 0,
          medium: 0,
          high: 0,
        },
      },
      meta: {
        cached: false,
      },
    });

    expect(getAuthorizedTeamIdsMock).toHaveBeenCalledTimes(1);
    expect(getTasksMock).toHaveBeenCalledTimes(1);
  });

  test('uses cached task summary on the second request', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    getTasksMock.mockResolvedValue({
      data: [
        createTask({
          id: 1,
          status: 'completed',
        }),
      ],
      meta: {
        current_page: 1,
        per_page: 100,
        total: 1,
        last_page: 1,
      },
    });

    const firstResponse = await request(app)
      .get('/api/v1/analytics/tasks/summary')
      .set('Authorization', `Bearer ${token}`);

    const secondResponse = await request(app)
      .get('/api/v1/analytics/tasks/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.meta.cached).toBe(false);

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.meta.cached).toBe(true);

    expect(getTasksMock).toHaveBeenCalledTimes(1);
  });

  test('passes a team filter to analytics authorization', async () => {
    const token = createToken({
      sub: '2',
      role: 'manager',
    });

    getAuthorizedTeamIdsMock.mockResolvedValue([1, 2]);

    const response = await request(app)
      .get(
        '/api/v1/analytics/tasks/summary?team_id=22222222-2222-4222-8222-222222222222',
      )
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(resolveAnalyticsTeamIdsMock).toHaveBeenCalledWith({
      authenticatedUser: expect.objectContaining({
        id: '2',
        role: 'manager',
      }),
      requestedTeamId: '22222222-2222-4222-8222-222222222222',
      authorizedTeamIds: [1, 2],
    });
  });

  test('rejects invalid task summary query parameters', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/analytics/tasks/summary?team_id=invalid')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);

    expect(response.body).toMatchObject({
      message: 'Analytics request validation failed.',
      code: 'VALIDATION_FAILED',
      errors: {
        team_id: expect.any(Array),
      },
    });

    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('returns team highlights for an admin', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    getTasksMock.mockResolvedValue({
      data: [
        createTask({
          status: 'pending',
          priority: 'high',
          due_date: '2000-01-01T00:00:00.000Z',
        }),
        createTask({
          id: 2,
          status: 'completed',
          priority: 'medium',
          completed_at: '2026-08-02T00:00:00.000Z',
        }),
      ],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const response = await request(app)
      .get('/api/v1/analytics/teams/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      message: 'Team highlights retrieved successfully.',
      data: {
        teams: [
          expect.objectContaining({
            team_name: 'Engineering',
            member_count: 2,
            total_tasks: 2,
            status: {
              yet_to_start: 1,
              in_progress: 0,
              completed: 1,
              cancelled: 0,
            },
            priority: {
              low: 0,
              medium: 1,
              high: 1,
            },
            high_priority: expect.objectContaining({
              yet_to_start: 1,
              overdue: 1,
            }),
          }),
        ],
      },
      meta: {
        cached: false,
      },
    });

    expect(getTeamsMock).toHaveBeenCalledWith({
      page: 1,
      per_page: 100,
    });
  });

  test('requests only authorized teams for a manager', async () => {
    const token = createToken({
      sub: '2',
      role: 'manager',
    });

    getAuthorizedTeamIdsMock.mockResolvedValue([1]);

    const response = await request(app)
      .get('/api/v1/analytics/teams/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(getTeamsMock).toHaveBeenCalledWith({
      user_id: '2',
      page: 1,
      per_page: 100,
    });
  });

  test('rejects team member access to team highlights', async () => {
    const token = createToken({
      sub: '3',
      role: 'team_member',
    });

    const response = await request(app)
      .get('/api/v1/analytics/teams/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(getTeamsMock).not.toHaveBeenCalled();
    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('returns team productivity', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    getTasksMock.mockResolvedValue({
      data: [
        createTask({
          id: 1,
          team_id: 1,
          status: 'completed',
          assigned_to: 3,
        }),
        createTask({
          id: 2,
          team_id: 1,
          status: 'pending',
          assigned_to: 3,
        }),
      ],
      meta: {
        current_page: 1,
        per_page: 100,
        total: 2,
        last_page: 1,
      },
    });

    const response = await request(app)
      .get(
        '/api/v1/analytics/teams/11111111-1111-4111-8111-111111111111/productivity',
      )
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      message: 'Team productivity retrieved successfully.',
      data: {
        team: {
          id: 1,
          name: 'Engineering',
        },
        summary: {
          total_tasks: 2,
          completed_tasks: 1,
          pending_tasks: 1,
          completion_rate: 50,
        },
      },
      meta: {
        cached: false,
      },
    });

    expect(assertTeamAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'admin',
      }),
      '11111111-1111-4111-8111-111111111111',
      undefined,
    );

    expect(getTeamMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(getTasksMock).toHaveBeenCalledWith({
      team_id: '11111111-1111-4111-8111-111111111111',
      page: 1,
      per_page: 100,
    });
  });

  test('rejects an invalid productivity team ID', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/analytics/teams/invalid/productivity')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: {
        teamId: expect.any(Array),
      },
    });

    expect(getTeamMock).not.toHaveBeenCalled();
    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('returns forbidden when manager lacks team access', async () => {
    const token = createToken({
      sub: '2',
      role: 'manager',
    });

    getAuthorizedTeamIdsMock.mockResolvedValue([1]);

    assertTeamAccessMock.mockImplementation(() => {
      throw new AppError(
        'You are not authorized to view analytics for this team.',
        {
          statusCode: 403,
          code: 'FORBIDDEN',
        },
      );
    });

    const response = await request(app)
      .get(
        '/api/v1/analytics/teams/99999999-9999-4999-8999-999999999999/productivity',
      )
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toEqual({
      message: 'You are not authorized to view analytics for this team.',
      code: 'FORBIDDEN',
    });

    expect(getTeamMock).not.toHaveBeenCalled();
    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('returns a filtered team report', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    const teamId = '11111111-1111-4111-8111-111111111111';

    const memberId = '33333333-3333-4333-8333-333333333333';

    getTeamMock.mockResolvedValue({
      data: {
        team: createTeam({
          id: teamId,
          members: [
            {
              id: memberId,
              name: 'Team Member',
              email: 'member@test.com',
              role: 'team_member',
              is_active: true,
              member_role: 'member',
            },
          ],
        }),
      },
    });

    getTasksMock.mockResolvedValue({
      data: [
        createTask({
          id: 'task-1',
          team_id: teamId,
          assigned_to: memberId,
          status: 'completed',
          priority: 'high',
          due_date: '2026-08-10T00:00:00.000Z',
          completed_at: '2026-08-09T00:00:00.000Z',
        }),
      ],
      meta: {
        current_page: 1,
        per_page: 100,
        total: 1,
        last_page: 1,
      },
    });

    const response = await request(app)
      .get(
        `/api/v1/analytics/teams/${teamId}/report` +
          '?date_from=2026-08-01' +
          '&date_to=2026-08-31' +
          '&date_field=due_date' +
          `&member_ids=${memberId}` +
          '&statuses=completed' +
          '&priorities=high',
      )
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      message: 'Team report retrieved successfully.',
      data: {
        team: {
          id: teamId,
          name: 'Engineering',
        },
        filters: {
          date_from: '2026-08-01',
          date_to: '2026-08-31',
          date_field: 'due_date',
          member_ids: [memberId],
          statuses: ['completed'],
          priorities: ['high'],
        },
        summary: {
          total_tasks: 1,
          completed_tasks: 1,
        },
        members: [
          {
            user_id: memberId,
            summary: {
              assigned_tasks: 1,
              completed_tasks: 1,
            },
          },
        ],
      },
      meta: {
        cached: false,
      },
    });

    expect(assertTeamAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'admin',
      }),
      teamId,
      undefined,
    );

    expect(getTasksMock).toHaveBeenCalledWith({
      team_id: teamId,
      page: 1,
      per_page: 100,
    });
  });

  test('uses a separate cache entry for each report period', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    const teamId = '11111111-1111-4111-8111-111111111111';

    getTeamMock.mockResolvedValue({
      data: {
        team: createTeam({
          id: teamId,
          members: [],
        }),
      },
    });

    const firstResponse = await request(app)
      .get(
        `/api/v1/analytics/teams/${teamId}/report` +
          '?date_from=2026-08-01&date_to=2026-08-15',
      )
      .set('Authorization', `Bearer ${token}`);

    const secondResponse = await request(app)
      .get(
        `/api/v1/analytics/teams/${teamId}/report` +
          '?date_from=2026-08-16&date_to=2026-08-31',
      )
      .set('Authorization', `Bearer ${token}`);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    expect(firstResponse.body.meta.cached).toBe(false);
    expect(secondResponse.body.meta.cached).toBe(false);

    expect(getTasksMock).toHaveBeenCalledTimes(2);
  });

  test('rejects a report member outside the selected team', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    const teamId = '11111111-1111-4111-8111-111111111111';

    getTeamMock.mockResolvedValue({
      data: {
        team: createTeam({
          id: teamId,
          members: [],
        }),
      },
    });

    const response = await request(app)
      .get(
        `/api/v1/analytics/teams/${teamId}/report` +
          '?member_ids=99999999-9999-4999-8999-999999999999',
      )
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: {
        member_ids: expect.any(Array),
      },
    });
  });

  test('rejects team member access to team reports', async () => {
    const token = createToken({
      sub: '3',
      role: 'team_member',
    });

    const response = await request(app)
      .get(
        '/api/v1/analytics/teams/' +
          '11111111-1111-4111-8111-111111111111/report',
      )
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(getTeamMock).not.toHaveBeenCalled();
    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('returns upcoming deadlines with default seven-day range', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    getTasksMock.mockResolvedValue({
      data: [],
      meta: {
        current_page: 1,
        per_page: 100,
        total: 0,
        last_page: 1,
      },
    });

    const response = await request(app)
      .get('/api/v1/analytics/deadlines/upcoming')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      message: 'Upcoming deadlines retrieved successfully.',
      data: {
        range_days: 7,
        overdue: [],
        upcoming: [],
      },
      meta: {
        cached: false,
      },
    });
  });

  test('rejects invalid deadline query parameters', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/analytics/deadlines/upcoming?days=91')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: {
        days: expect.any(Array),
      },
    });

    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('preserves Laravel client failures', async () => {
    const token = createToken({
      role: 'admin',
    });

    getTasksMock.mockRejectedValue(
      new AppError('Laravel API is unavailable.', {
        statusCode: 503,
        code: 'LARAVEL_UNAVAILABLE',
      }),
    );

    const response = await request(app)
      .get('/api/v1/analytics/tasks/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(503);

    expect(response.body).toEqual({
      message: 'Laravel API is unavailable.',
      code: 'LARAVEL_UNAVAILABLE',
    });
  });
});
