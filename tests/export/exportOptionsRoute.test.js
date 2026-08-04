import { jest } from '@jest/globals';
import request from 'supertest';

const getTeamsMock = jest.fn();
const getTeamMock = jest.fn();
const getUsersMock = jest.fn();
const getUserMock = jest.fn();

jest.unstable_mockModule('../../src/clients/laravel/teamClient.js', () => ({
  getTeams: getTeamsMock,
  getTeam: getTeamMock,
}));

jest.unstable_mockModule('../../src/clients/laravel/userClient.js', () => ({
  getUsers: getUsersMock,
  getUser: getUserMock,
}));

const { default: app } = await import('../../src/app.js');
const { createToken } = await import('../helpers/jwt.js');

const engineeringTeam = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Engineering',
};

const operationsTeam = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Operations',
};

const engineeringMember = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Engineering Member',
  email: 'engineering@example.com',
  role: 'team_member',
  is_active: true,
};

const operationsMember = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Operations Member',
  email: 'operations@example.com',
  role: 'team_member',
  is_active: true,
};

describe('Export options route', () => {
  beforeEach(() => {
    getTeamsMock.mockReset();
    getTeamMock.mockReset();
    getUsersMock.mockReset();
    getUserMock.mockReset();

    getTeamsMock.mockResolvedValue({
      data: [],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    getUsersMock.mockResolvedValue({
      data: [],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });
  });

  test('requires authentication', async () => {
    const response = await request(app).get('/api/v1/export/options');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
  });

  test('returns all teams and active users for an admin', async () => {
    getTeamsMock.mockResolvedValue({
      data: [engineeringTeam, operationsTeam],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    getUsersMock.mockResolvedValue({
      data: [engineeringMember, operationsMember],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    const response = await request(app)
      .get('/api/v1/export/options')
      .set(
        'Authorization',
        `Bearer ${createToken({
          sub: 'admin-1',
          role: 'admin',
        })}`,
      );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      scope: 'all',
      teams: [engineeringTeam, operationsTeam],
      users: [
        {
          id: engineeringMember.id,
          name: engineeringMember.name,
          email: engineeringMember.email,
          role: engineeringMember.role,
        },
        {
          id: operationsMember.id,
          name: operationsMember.name,
          email: operationsMember.email,
          role: operationsMember.role,
        },
      ],
    });

    expect(getTeamsMock).toHaveBeenCalledWith({
      page: 1,
      per_page: 100,
    });

    expect(getUsersMock).toHaveBeenCalledWith({
      is_active: true,
      page: 1,
      per_page: 100,
    });
  });

  test('returns only handled teams and their members for a manager', async () => {
    const managerId = '55555555-5555-4555-8555-555555555555';

    getTeamsMock.mockResolvedValue({
      data: [engineeringTeam],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    getTeamMock.mockResolvedValue({
      data: {
        team: {
          ...engineeringTeam,
          members: [engineeringMember],
        },
      },
    });

    const response = await request(app)
      .get('/api/v1/export/options')
      .set(
        'Authorization',
        `Bearer ${createToken({
          sub: managerId,
          role: 'manager',
        })}`,
      );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      scope: 'managed',
      teams: [engineeringTeam],
      users: [
        {
          id: engineeringMember.id,
          name: engineeringMember.name,
          email: engineeringMember.email,
          role: engineeringMember.role,
        },
      ],
    });

    expect(getTeamsMock).toHaveBeenCalledWith({
      managed_by: managerId,
      page: 1,
      per_page: 100,
    });

    expect(getTeamMock).toHaveBeenCalledWith(engineeringTeam.id);
    expect(getUsersMock).not.toHaveBeenCalled();
  });

  test('deduplicates members belonging to multiple handled teams', async () => {
    const managerId = '55555555-5555-4555-8555-555555555555';

    getTeamsMock.mockResolvedValue({
      data: [engineeringTeam, operationsTeam],
      meta: {
        current_page: 1,
        last_page: 1,
      },
    });

    getTeamMock
      .mockResolvedValueOnce({
        data: {
          team: {
            ...engineeringTeam,
            members: [engineeringMember],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          team: {
            ...operationsTeam,
            members: [engineeringMember, operationsMember],
          },
        },
      });

    const response = await request(app)
      .get('/api/v1/export/options')
      .set(
        'Authorization',
        `Bearer ${createToken({
          sub: managerId,
          role: 'manager',
        })}`,
      );

    expect(response.status).toBe(200);
    expect(response.body.data.users).toHaveLength(2);
  });

  test('returns only the authenticated user for a team member', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: engineeringMember,
      },
    });

    const response = await request(app)
      .get('/api/v1/export/options')
      .set(
        'Authorization',
        `Bearer ${createToken({
          sub: engineeringMember.id,
          role: 'team_member',
        })}`,
      );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      scope: 'self',
      teams: [],
      users: [
        {
          id: engineeringMember.id,
          name: engineeringMember.name,
          email: engineeringMember.email,
          role: engineeringMember.role,
        },
      ],
    });

    expect(getUserMock).toHaveBeenCalledWith(engineeringMember.id);
    expect(getTeamsMock).not.toHaveBeenCalled();
    expect(getUsersMock).not.toHaveBeenCalled();
  });

  test('rejects an invalid Laravel user response', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: null,
      },
    });

    const response = await request(app)
      .get('/api/v1/export/options')
      .set(
        'Authorization',
        `Bearer ${createToken({
          sub: engineeringMember.id,
          role: 'team_member',
        })}`,
      );

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('INVALID_LARAVEL_RESPONSE');
  });
});
