import { jest } from '@jest/globals';
import request from 'supertest';

const getTasksMock = jest.fn();
const getTeamMock = jest.fn();
const getTeamsMock = jest.fn();
const getAuthorizedTeamIdsMock = jest.fn();
const assertTeamAccessMock = jest.fn();
const resolveAnalyticsTeamIdsMock = jest.fn();
const buildCSVMock = jest.fn();
const buildJSONMock = jest.fn();
const buildXLSXMock = jest.fn();
const logExportSuccessMock = jest.fn();
const logExportFailureMock = jest.fn();

jest.unstable_mockModule('../../src/clients/laravel/taskClient.js', () => ({
  getTasks: getTasksMock,
  getTask: jest.fn(),
}));

jest.unstable_mockModule('../../src/clients/laravel/teamClient.js', () => ({
  getTeam: getTeamMock,
  getTeams: getTeamsMock,
}));

jest.unstable_mockModule(
  '../../src/services/analyticsAuthorization.service.js',
  () => ({
    getAuthorizedTeamIds: getAuthorizedTeamIdsMock,
    resolveAnalyticsTeamIds: resolveAnalyticsTeamIdsMock,
    assertTeamAccess: assertTeamAccessMock,
  }),
);

jest.unstable_mockModule('../../src/services/export.service.js', () => ({
  buildCSV: buildCSVMock,
  buildJSON: buildJSONMock,
  buildXLSX: buildXLSXMock,
}));

jest.unstable_mockModule('../../src/services/exportAudit.service.js', () => ({
  logExportSuccess: logExportSuccessMock,
  logExportFailure: logExportFailureMock,
}));

const { default: app } = await import('../../src/app.js');
const { createToken } = await import('../helpers/jwt.js');

function createTask(overrides = {}) {
  return {
    id: 1,
    team_id: 1,
    title: 'Setup database',
    description: 'Configure the database.',
    status: 'in_progress',
    priority: 'high',
    assigned_to: 3,
    created_by: 2,
    due_date: '2026-08-05T00:00:00.000Z',
    completed_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Export routes', () => {
  beforeEach(() => {
    getTasksMock.mockReset();
    getTeamMock.mockReset();
    getTeamsMock.mockReset();
    getAuthorizedTeamIdsMock.mockReset();
    assertTeamAccessMock.mockReset();
    resolveAnalyticsTeamIdsMock.mockReset();
    buildCSVMock.mockReset();
    buildJSONMock.mockReset();
    buildXLSXMock.mockReset();
    logExportSuccessMock.mockReset();
    logExportFailureMock.mockReset();

    getAuthorizedTeamIdsMock.mockResolvedValue(undefined);

    resolveAnalyticsTeamIdsMock.mockReturnValue(undefined);

    getTeamsMock.mockResolvedValue({
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Engineering',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Operations',
        },
      ],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    getTeamMock.mockResolvedValue({
      data: {
        team: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Engineering',
          members: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              name: 'Team Member',
              email: 'member@test.com',
              role: 'team_member',
              is_active: true,
              member_role: 'member',
            },
          ],
        },
      },
    });

    getTasksMock.mockResolvedValue({
      data: [createTask()],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    buildCSVMock.mockReturnValue(
      Buffer.from('ID,Title\r\n1,Setup database\r\n'),
    );

    buildJSONMock.mockReturnValue(Buffer.from('{"data":[]}\n'));

    buildXLSXMock.mockResolvedValue(Buffer.from('xlsx-buffer'));
  });

  test('rejects a request without authentication', async () => {
    const response = await request(app).get('/api/v1/export/tasks/csv');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });

    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('exports only the authenticated team members own tasks', async () => {
    const memberId = '33333333-3333-4333-8333-333333333333';

    const token = createToken({
      sub: memberId,
      role: 'team_member',
    });

    const response = await request(app)
      .post('/api/v1/export/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        format: 'csv',
        filters: {
          status: 'completed',
        },
      });

    expect(response.status).toBe(200);

    expect(getTasksMock).toHaveBeenCalledWith({
      status: 'completed',
      assigned_to: memberId,
      include_report_context: true,
      page: 1,
      per_page: 100,
    });
  });

  test('rejects a team member exporting another person', async () => {
    const token = createToken({
      sub: '33333333-3333-4333-8333-333333333333',
      role: 'team_member',
    });

    const response = await request(app)
      .post('/api/v1/export/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        format: 'json',
        filters: {
          assigned_to: '44444444-4444-4444-8444-444444444444',
        },
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
    });

    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('rejects an unsupported format', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/export/tasks/pdf')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      message: 'Export request validation failed.',
      code: 'VALIDATION_FAILED',
    });

    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('rejects an invalid team filter', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/export/tasks/csv?team_id=invalid')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);
    expect(response.body.errors).toEqual(
      expect.objectContaining({
        team_id: expect.any(Array),
      }),
    );
  });

  test('exports tasks as CSV', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/export/tasks/csv')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="management-task-report-.+\.csv"$/,
    );
    expect(response.headers['cache-control']).toBe(
      'private, no-store, max-age=0',
    );

    expect(buildCSVMock).toHaveBeenCalledTimes(1);
    expect(logExportSuccessMock).toHaveBeenCalledTimes(1);
  });

  test('exports tasks as JSON', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/export/tasks/json')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="management-task-report-.+\.json"$/,
    );

    expect(buildJSONMock).toHaveBeenCalledTimes(1);
  });

  test('exports tasks as XLSX', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/export/tasks/xlsx')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="management-task-report-.+\.xlsx"$/,
    );

    expect(buildXLSXMock).toHaveBeenCalledTimes(1);
  });

  test('passes an authorized manager team filter to Laravel', async () => {
    const token = createToken({
      sub: '22222222-2222-4222-8222-222222222222',
      role: 'manager',
    });

    const teamId = '11111111-1111-4111-8111-111111111111';

    const response = await request(app)
      .get(`/api/v1/export/tasks/csv?team_id=${teamId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(getTeamsMock).toHaveBeenCalledWith({
      managed_by: '22222222-2222-4222-8222-222222222222',
      page: 1,
      per_page: 100,
    });

    expect(getTasksMock).toHaveBeenCalledWith({
      team_id: teamId,
      include_report_context: true,
      page: 1,
      per_page: 100,
    });
  });

  test('filters manager exports to handled teams', async () => {
    const token = createToken({
      sub: '22222222-2222-4222-8222-222222222222',
      role: 'manager',
    });

    const authorizedTeamId = '11111111-1111-4111-8111-111111111111';

    const unauthorizedTeamId = '99999999-9999-4999-8999-999999999999';

    getTeamsMock.mockResolvedValueOnce({
      data: [
        {
          id: authorizedTeamId,
          name: 'Engineering',
        },
      ],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    getTasksMock.mockResolvedValue({
      data: [
        createTask({
          id: 'task-1',
          team_id: authorizedTeamId,
        }),
        createTask({
          id: 'task-2',
          team_id: unauthorizedTeamId,
        }),
      ],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const response = await request(app)
      .get('/api/v1/export/tasks/json')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(buildJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Management task report exported successfully.',
        data: expect.objectContaining({
          tasks: [
            expect.objectContaining({
              task_id: 'task-1',
            }),
          ],
        }),
        meta: expect.objectContaining({
          task_count: 1,
        }),
      }),
    );
  });

  test('retrieves every Laravel task page', async () => {
    const token = createToken({
      role: 'admin',
    });

    getTasksMock
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
          }),
        ],
        meta: {
          current_page: 2,
          last_page: 2,
        },
      });

    const response = await request(app)
      .get('/api/v1/export/tasks/csv')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(getTasksMock).toHaveBeenCalledTimes(2);
    expect(buildCSVMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          expect.objectContaining({
            task_id: 1,
          }),
          expect.objectContaining({
            task_id: 2,
          }),
        ],
      }),
    );
  });

  test('logs failed exports', async () => {
    const token = createToken({
      role: 'admin',
    });

    getTasksMock.mockRejectedValue(
      Object.assign(new Error('Laravel timeout.'), {
        code: 'LARAVEL_TIMEOUT',
        statusCode: 504,
      }),
    );

    const response = await request(app)
      .get('/api/v1/export/tasks/csv')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(504);
    expect(logExportFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          role: 'admin',
        }),
        resource: 'tasks',
        format: 'csv',
        error: expect.any(Error),
      }),
    );
  });

  test('preserves Laravel client failures', async () => {
    const token = createToken({
      role: 'admin',
    });

    getTasksMock.mockRejectedValue(
      Object.assign(new Error('Laravel unavailable.'), {
        code: 'LARAVEL_UNAVAILABLE',
        statusCode: 503,
      }),
    );

    const response = await request(app)
      .get('/api/v1/export/tasks/csv')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'LARAVEL_UNAVAILABLE',
    });
  });
  test('exports tasks through the required POST contract', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .post('/api/v1/export/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        format: 'csv',
        team_id: '11111111-1111-4111-8111-111111111111',
        filters: {
          status: 'completed',
          priority: 'high',
          assigned_to: '33333333-3333-4333-8333-333333333333',
          date_from: '2026-08-01',
          date_to: '2026-08-31',
        },
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');

    expect(getTasksMock).toHaveBeenCalledWith({
      team_id: '11111111-1111-4111-8111-111111111111',
      status: 'completed',
      priority: 'high',
      assigned_to: '33333333-3333-4333-8333-333333333333',
      date_from: '2026-08-01',
      date_to: '2026-08-31',
      include_report_context: true,
      page: 1,
      per_page: 100,
    });

    expect(logExportSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'tasks',
        format: 'csv',
        filters: expect.objectContaining({
          team_id: '11111111-1111-4111-8111-111111111111',
          status: 'completed',
          priority: 'high',
          assigned_to: '33333333-3333-4333-8333-333333333333',
          date_from: '2026-08-01',
          date_to: '2026-08-31',
        }),
      }),
    );
  });

  test('rejects an unsupported POST export format', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .post('/api/v1/export/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        format: 'pdf',
        filters: {},
      });

    expect(response.status).toBe(422);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('rejects a reversed task export date range', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .post('/api/v1/export/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        format: 'json',
        filters: {
          date_from: '2026-08-31',
          date_to: '2026-08-01',
        },
      });

    expect(response.status).toBe(422);

    expect(response.body.errors).toEqual(
      expect.objectContaining({
        'filters.date_to': expect.any(Array),
      }),
    );

    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('rejects an unauthenticated POST task export', async () => {
    const response = await request(app).post('/api/v1/export/tasks').send({
      format: 'csv',
      filters: {},
    });

    expect(response.status).toBe(401);
    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('exports task summary as CSV', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/export/analytics/summary/csv')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.headers['content-type']).toContain('text/csv');

    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="analytics-summary-.+\.csv"$/,
    );

    expect(buildCSVMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          expect.objectContaining({
            total_tasks: 1,
            in_progress_tasks: 1,
            completion_rate: 0,
          }),
        ],
      }),
    );

    expect(logExportSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'analytics_summary',
        format: 'csv',
        recordCount: 1,
      }),
    );
  });

  test('exports task summary as JSON', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/export/analytics/summary/json')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(buildJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Task summary exported successfully.',
        data: expect.objectContaining({
          total_tasks: 1,
          status: expect.objectContaining({
            in_progress: 1,
          }),
        }),
        meta: {
          record_count: 1,
        },
      }),
    );
  });

  test('applies a team filter to task summary export', async () => {
    const token = createToken({
      sub: '2',
      role: 'manager',
    });

    getAuthorizedTeamIdsMock.mockResolvedValue([1, 2]);
    resolveAnalyticsTeamIdsMock.mockReturnValue([1]);

    const response = await request(app)
      .get(
        '/api/v1/export/analytics/summary/csv?team_id=11111111-1111-4111-8111-111111111111',
      )
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(resolveAnalyticsTeamIdsMock).toHaveBeenCalledWith({
      authenticatedUser: expect.objectContaining({
        id: '2',
        role: 'manager',
      }),
      requestedTeamId: '11111111-1111-4111-8111-111111111111',
      authorizedTeamIds: [1, 2],
    });
  });

  test('exports upcoming deadlines as CSV', async () => {
    const token = createToken({
      role: 'admin',
    });

    getTasksMock.mockResolvedValue({
      data: [
        createTask({
          id: 5,
          status: 'pending',
          due_date: '2099-08-05T00:00:00.000Z',
        }),
      ],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const response = await request(app)
      .get('/api/v1/export/deadlines/csv?days=30')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.headers['content-type']).toContain('text/csv');

    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="upcoming-deadlines-.+\.csv"$/,
    );

    expect(logExportSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'upcoming_deadlines',
        format: 'csv',
      }),
    );
  });

  test('exports upcoming deadlines as JSON', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/export/deadlines/json')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(buildJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Upcoming deadlines exported successfully.',
        data: expect.objectContaining({
          range_days: 7,
          overdue: expect.any(Array),
          upcoming: expect.any(Array),
        }),
      }),
    );
  });

  test('applies the default seven-day deadline range', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/export/deadlines/xlsx')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(logExportSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          days: 7,
        }),
      }),
    );
  });

  test('rejects an invalid deadline day range', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/export/deadlines/csv?days=0')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);

    expect(response.body).toMatchObject({
      message: 'Export request validation failed.',
      code: 'VALIDATION_FAILED',
      errors: {
        days: expect.any(Array),
      },
    });
  });

  test('logs task-summary export failures', async () => {
    const token = createToken({
      role: 'admin',
    });

    getTasksMock.mockRejectedValue(
      Object.assign(new Error('Laravel unavailable.'), {
        code: 'LARAVEL_UNAVAILABLE',
        statusCode: 503,
      }),
    );

    const response = await request(app)
      .get('/api/v1/export/analytics/summary/csv')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(503);

    expect(logExportFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'analytics_summary',
        format: 'csv',
        error: expect.any(Error),
      }),
    );
  });

  test('logs deadline export failures', async () => {
    const token = createToken({
      role: 'admin',
    });

    getTasksMock.mockRejectedValue(
      Object.assign(new Error('Laravel timeout.'), {
        code: 'LARAVEL_TIMEOUT',
        statusCode: 504,
      }),
    );

    const response = await request(app)
      .get('/api/v1/export/deadlines/xlsx')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(504);

    expect(logExportFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'upcoming_deadlines',
        format: 'xlsx',
        error: expect.any(Error),
      }),
    );
  });
  test('exports a team report as JSON', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    const teamId = '11111111-1111-4111-8111-111111111111';

    const memberId = '33333333-3333-4333-8333-333333333333';

    getTasksMock.mockResolvedValue({
      data: [
        createTask({
          id: 'task-1',
          team_id: teamId,
          assigned_to: memberId,
          status: 'completed',
          completed_at: '2026-08-03T00:00:00.000Z',
        }),
      ],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const response = await request(app)
      .get(
        '/api/v1/export/team-report/json' +
          `?team_id=${teamId}` +
          `&member_ids=${memberId}`,
      )
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="team-report-.+\.json"$/,
    );

    expect(buildJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Team report exported successfully.',
        data: expect.objectContaining({
          team: {
            id: teamId,
            name: 'Engineering',
          },
          members: [
            expect.objectContaining({
              user_id: memberId,
            }),
          ],
        }),
      }),
    );

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

  test('exports a team report as CSV task rows', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    const teamId = '11111111-1111-4111-8111-111111111111';

    const memberId = '33333333-3333-4333-8333-333333333333';

    getTasksMock.mockResolvedValue({
      data: [
        createTask({
          id: 'task-1',
          team_id: teamId,
          assigned_to: memberId,
        }),
      ],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const response = await request(app)
      .get('/api/v1/export/team-report/csv' + `?team_id=${teamId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(buildCSVMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          expect.objectContaining({
            team_id: teamId,
            member_id: memberId,
            task_id: 'task-1',
            task_title: 'Setup database',
          }),
        ],
      }),
    );
  });

  test('exports a three-sheet team report workbook', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    const teamId = '11111111-1111-4111-8111-111111111111';

    const response = await request(app)
      .get('/api/v1/export/team-report/xlsx' + `?team_id=${teamId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(buildXLSXMock).toHaveBeenCalledWith({
      worksheets: [
        expect.objectContaining({
          worksheetName: 'Team Summary',
        }),
        expect.objectContaining({
          worksheetName: 'Member Summary',
        }),
        expect.objectContaining({
          worksheetName: 'Task Details',
        }),
      ],
    });
  });

  test('rejects a team report without team_id', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/export/team-report/csv')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: {
        team_id: expect.any(Array),
      },
    });

    expect(getTeamMock).not.toHaveBeenCalled();
    expect(getTasksMock).not.toHaveBeenCalled();
  });

  test('rejects a report member outside the team', async () => {
    const token = createToken({
      role: 'admin',
    });

    const teamId = '11111111-1111-4111-8111-111111111111';

    const response = await request(app)
      .get(
        '/api/v1/export/team-report/json' +
          `?team_id=${teamId}` +
          '&member_ids=99999999-9999-4999-8999-999999999999',
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

  test('logs a successful team report export', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    const teamId = '11111111-1111-4111-8111-111111111111';

    const response = await request(app)
      .get('/api/v1/export/team-report/json' + `?team_id=${teamId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(logExportSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'team_report',
        format: 'json',
        filters: expect.objectContaining({
          team_id: teamId,
          date_field: 'due_date',
        }),
      }),
    );
  });
});
