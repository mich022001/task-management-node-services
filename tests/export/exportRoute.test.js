import { jest } from '@jest/globals';
import request from 'supertest';

const getTasksMock = jest.fn();
const getAuthorizedTeamIdsMock = jest.fn();
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

jest.unstable_mockModule(
  '../../src/services/analyticsAuthorization.service.js',
  () => ({
    getAuthorizedTeamIds: getAuthorizedTeamIdsMock,
    resolveAnalyticsTeamIds: resolveAnalyticsTeamIdsMock,
    assertTeamAccess: jest.fn(),
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
    getAuthorizedTeamIdsMock.mockReset();
    resolveAnalyticsTeamIdsMock.mockReset();
    buildCSVMock.mockReset();
    buildJSONMock.mockReset();
    buildXLSXMock.mockReset();
    logExportSuccessMock.mockReset();
    logExportFailureMock.mockReset();

    getAuthorizedTeamIdsMock.mockResolvedValue(undefined);

    resolveAnalyticsTeamIdsMock.mockReturnValue(undefined);

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

  test('rejects a team member', async () => {
    const token = createToken({
      sub: '3',
      role: 'team_member',
    });

    const response = await request(app)
      .get('/api/v1/export/tasks/csv')
      .set('Authorization', `Bearer ${token}`);

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
      /^attachment; filename="tasks-.+\.csv"$/,
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
      /^attachment; filename="tasks-.+\.json"$/,
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
      /^attachment; filename="tasks-.+\.xlsx"$/,
    );

    expect(buildXLSXMock).toHaveBeenCalledTimes(1);
  });

  test('passes a team filter to Laravel and authorization', async () => {
    const token = createToken({
      sub: '2',
      role: 'manager',
    });

    getAuthorizedTeamIdsMock.mockResolvedValue([1, 2]);

    resolveAnalyticsTeamIdsMock.mockReturnValue([1]);

    const response = await request(app)
      .get(
        '/api/v1/export/tasks/csv?team_id=11111111-1111-4111-8111-111111111111',
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

    expect(getTasksMock).toHaveBeenCalledWith({
      team_id: '11111111-1111-4111-8111-111111111111',
      page: 1,
      per_page: 100,
    });
  });

  test('filters manager exports to authorized teams', async () => {
    const token = createToken({
      sub: '2',
      role: 'manager',
    });

    getAuthorizedTeamIdsMock.mockResolvedValue([1]);
    resolveAnalyticsTeamIdsMock.mockReturnValue([1]);

    getTasksMock.mockResolvedValue({
      data: [
        createTask({
          id: 1,
          team_id: 1,
        }),
        createTask({
          id: 2,
          team_id: 9,
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
        data: [
          expect.objectContaining({
            id: 1,
            team_id: 1,
          }),
        ],
        meta: {
          record_count: 1,
        },
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
            id: 1,
          }),
          expect.objectContaining({
            id: 2,
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
});
