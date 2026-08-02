import { jest } from '@jest/globals';

import {
  createExportAuditEntry,
  logExportFailure,
  logExportSuccess,
} from '../../src/services/exportAudit.service.js';

function createUser(overrides = {}) {
  return {
    id: '2',
    email: 'manager@test.com',
    role: 'manager',
    ...overrides,
  };
}

describe('Export audit service', () => {
  test('creates a successful audit entry', () => {
    const timestamp = new Date('2026-08-02T10:00:00.000Z');

    const entry = createExportAuditEntry({
      user: createUser(),
      resource: 'tasks',
      format: 'csv',
      filters: {
        team_id: 1,
      },
      status: 'success',
      filename: 'tasks.csv',
      recordCount: 4,
      timestamp,
    });

    expect(entry).toEqual({
      id: expect.any(String),
      user_id: '2',
      user_email: 'manager@test.com',
      role: 'manager',
      resource: 'tasks',
      format: 'csv',
      filters: {
        team_id: 1,
      },
      status: 'success',
      filename: 'tasks.csv',
      record_count: 4,
      error: null,
      created_at: '2026-08-02T10:00:00.000Z',
    });
  });

  test('creates a failed audit entry with normalized error details', () => {
    const error = Object.assign(new Error('Laravel request timed out.'), {
      code: 'LARAVEL_TIMEOUT',
    });

    const entry = createExportAuditEntry({
      user: createUser(),
      resource: 'tasks',
      format: 'xlsx',
      filters: {},
      status: 'failed',
      error,
      timestamp: new Date('2026-08-02T10:10:00.000Z'),
    });

    expect(entry).toMatchObject({
      status: 'failed',
      error: {
        name: 'Error',
        code: 'LARAVEL_TIMEOUT',
        message: 'Laravel request timed out.',
      },
    });
  });

  test('clones filters to prevent later mutation', () => {
    const filters = {
      team_id: 1,
    };

    const entry = createExportAuditEntry({
      user: createUser(),
      resource: 'tasks',
      format: 'json',
      filters,
      status: 'success',
    });

    filters.team_id = 99;

    expect(entry.filters).toEqual({
      team_id: 1,
    });
  });

  test('normalizes missing filters to an empty object', () => {
    const entry = createExportAuditEntry({
      user: createUser(),
      resource: 'tasks',
      format: 'json',
      status: 'success',
    });

    expect(entry.filters).toEqual({});
  });

  test('does not store error details for successful exports', () => {
    const entry = createExportAuditEntry({
      user: createUser(),
      resource: 'tasks',
      format: 'csv',
      status: 'success',
      error: new Error('This must not be retained.'),
    });

    expect(entry.error).toBeNull();
  });

  test('logs successful exports with structured context', () => {
    const loggerInstance = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const entry = logExportSuccess({
      user: createUser(),
      resource: 'tasks',
      format: 'csv',
      filters: {
        team_id: 1,
      },
      filename: 'tasks.csv',
      recordCount: 4,
      loggerInstance,
    });

    expect(loggerInstance.info).toHaveBeenCalledWith(
      {
        audit: entry,
      },
      'Export completed successfully.',
    );

    expect(loggerInstance.error).not.toHaveBeenCalled();
  });

  test('logs failed exports with structured context', () => {
    const loggerInstance = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const error = new Error('Export failed.');

    const entry = logExportFailure({
      user: createUser(),
      resource: 'tasks',
      format: 'xlsx',
      filters: {},
      error,
      loggerInstance,
    });

    expect(loggerInstance.error).toHaveBeenCalledWith(
      {
        audit: entry,
      },
      'Export failed.',
    );

    expect(loggerInstance.info).not.toHaveBeenCalled();
  });

  test('rejects a missing authenticated user', () => {
    expect(() =>
      createExportAuditEntry({
        user: null,
        resource: 'tasks',
        format: 'csv',
        status: 'success',
      }),
    ).toThrow(TypeError);
  });

  test('rejects an invalid status', () => {
    expect(() =>
      createExportAuditEntry({
        user: createUser(),
        resource: 'tasks',
        format: 'csv',
        status: 'pending',
      }),
    ).toThrow(TypeError);
  });

  test('does not expose service secrets in audit data', () => {
    const entry = createExportAuditEntry({
      user: createUser(),
      resource: 'tasks',
      format: 'csv',
      filters: {
        team_id: 1,
      },
      status: 'success',
    });

    const serializedEntry = JSON.stringify(entry);

    expect(serializedEntry).not.toContain('SMTP_PASS');
    expect(serializedEntry).not.toContain('JWT_SECRET');
    expect(serializedEntry).not.toContain('LARAVEL_SERVICE_KEY');
  });
});
