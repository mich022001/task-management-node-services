import { jest } from '@jest/globals';
import request from 'supertest';

const getTasksMock = jest.fn();
const getTaskMock = jest.fn();
const getTeamMock = jest.fn();

const getAuthorizedTeamIdsMock = jest.fn();
const assertTeamAccessMock = jest.fn();
const resolveAnalyticsTeamIdsMock = jest.fn();

jest.unstable_mockModule('../../src/clients/laravel/taskClient.js', () => ({
  getTasks: getTasksMock,
  getTask: getTaskMock,
}));

jest.unstable_mockModule('../../src/clients/laravel/teamClient.js', () => ({
  getTeam: getTeamMock,
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
  });

  test('rejects a request without authentication', async () => {
    const response = await request(app).get('/api/v1/analytics/tasks/summary');

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });

    expect(getTasksMock).not.toHaveBeenCalled();
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
