import { jest } from '@jest/globals';

import {
  assertTeamAccess,
  getAuthorizedTeamIds,
  resolveAnalyticsTeamIds,
} from '../../src/services/analyticsAuthorization.service.js';

function createUser(overrides = {}) {
  return {
    id: '2',
    email: 'manager@test.com',
    role: 'manager',
    ...overrides,
  };
}

describe('Analytics authorization service', () => {
  describe('getAuthorizedTeamIds', () => {
    test('returns unrestricted access for an admin', async () => {
      const getTeamsForUserFn = jest.fn();

      const result = await getAuthorizedTeamIds(
        createUser({
          id: '1',
          role: 'admin',
        }),
        {
          getTeamsForUserFn,
        },
      );

      expect(result).toBeUndefined();
      expect(getTeamsForUserFn).not.toHaveBeenCalled();
    });

    test('rejects a missing authenticated user', async () => {
      await expect(
        getAuthorizedTeamIds(null, {
          getTeamsForUserFn: jest.fn(),
        }),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'AUTHENTICATION_REQUIRED',
      });
    });

    test('rejects a team member', async () => {
      await expect(
        getAuthorizedTeamIds(
          createUser({
            id: '3',
            role: 'team_member',
          }),
          {
            getTeamsForUserFn: jest.fn(),
          },
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });

    test('retrieves manager teams using one filtered operation', async () => {
      const getTeamsForUserFn = jest.fn().mockResolvedValue([
        {
          id: 1,
          name: 'Engineering',
        },
        {
          id: 4,
          name: 'Operations',
        },
      ]);

      const result = await getAuthorizedTeamIds(createUser(), {
        getTeamsForUserFn,
      });

      expect(result).toEqual([1, 4]);
      expect(getTeamsForUserFn).toHaveBeenCalledTimes(1);
      expect(getTeamsForUserFn).toHaveBeenCalledWith('2');
    });

    test('returns unique sorted team IDs', async () => {
      const getTeamsForUserFn = jest
        .fn()
        .mockResolvedValue([{ id: 9 }, { id: 2 }, { id: 5 }, { id: 2 }]);

      const result = await getAuthorizedTeamIds(createUser(), {
        getTeamsForUserFn,
      });

      expect(result).toEqual([2, 5, 9]);
    });

    test('returns an empty list when manager has no teams', async () => {
      const getTeamsForUserFn = jest.fn().mockResolvedValue([]);

      const result = await getAuthorizedTeamIds(createUser(), {
        getTeamsForUserFn,
      });

      expect(result).toEqual([]);
    });
  });

  describe('assertTeamAccess', () => {
    test('allows an admin to access any team', () => {
      expect(() =>
        assertTeamAccess(
          createUser({
            role: 'admin',
          }),
          999,
          undefined,
        ),
      ).not.toThrow();
    });

    test('allows a manager to access an authorized team', () => {
      expect(() => assertTeamAccess(createUser(), 3, [1, 3, 5])).not.toThrow();
    });

    test('normalizes string and numeric team IDs', () => {
      expect(() =>
        assertTeamAccess(createUser(), '3', [1, 3, 5]),
      ).not.toThrow();
    });

    test('rejects an unauthorized manager team', () => {
      expect(() => assertTeamAccess(createUser(), 7, [1, 3, 5])).toThrow(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
        }),
      );
    });

    test('rejects a team member', () => {
      expect(() =>
        assertTeamAccess(
          createUser({
            role: 'team_member',
          }),
          1,
          [1],
        ),
      ).toThrow(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
        }),
      );
    });
  });

  describe('resolveAnalyticsTeamIds', () => {
    test('returns unrestricted scope for an admin without a filter', () => {
      const result = resolveAnalyticsTeamIds({
        authenticatedUser: createUser({
          role: 'admin',
        }),
        requestedTeamId: undefined,
        authorizedTeamIds: undefined,
      });

      expect(result).toBeUndefined();
    });

    test('returns one filtered team for an admin', () => {
      const result = resolveAnalyticsTeamIds({
        authenticatedUser: createUser({
          role: 'admin',
        }),
        requestedTeamId: '8',
        authorizedTeamIds: undefined,
      });

      expect(result).toEqual([8]);
    });

    test('returns all authorized teams for a manager without a filter', () => {
      const result = resolveAnalyticsTeamIds({
        authenticatedUser: createUser(),
        requestedTeamId: undefined,
        authorizedTeamIds: [1, 3],
      });

      expect(result).toEqual([1, 3]);
    });

    test('returns one authorized team for a manager filter', () => {
      const result = resolveAnalyticsTeamIds({
        authenticatedUser: createUser(),
        requestedTeamId: '3',
        authorizedTeamIds: [1, 3],
      });

      expect(result).toEqual([3]);
    });

    test('rejects an unauthorized manager filter', () => {
      expect(() =>
        resolveAnalyticsTeamIds({
          authenticatedUser: createUser(),
          requestedTeamId: 8,
          authorizedTeamIds: [1, 3],
        }),
      ).toThrow(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
        }),
      );
    });
  });
});
