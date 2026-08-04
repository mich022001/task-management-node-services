import { jest } from '@jest/globals';

import { resolveTaskExportScope } from '../../src/services/exportAuthorization.service.js';

function createUser(overrides = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    role: 'manager',
    ...overrides,
  };
}

describe('Task export authorization', () => {
  test('allows an admin to export all tasks', async () => {
    const result = await resolveTaskExportScope(
      createUser({
        role: 'admin',
      }),
      {},
    );

    expect(result).toEqual({
      filters: {},
      teamIds: undefined,
    });
  });

  test('allows an admin to export one team or person', async () => {
    const result = await resolveTaskExportScope(
      createUser({
        role: 'admin',
      }),
      {
        team_id: 'team-1',
        assigned_to: 'member-1',
      },
    );

    expect(result).toEqual({
      filters: {
        team_id: 'team-1',
        assigned_to: 'member-1',
      },
      teamIds: ['team-1'],
    });
  });

  test('forces a team member export to their own user ID', async () => {
    const result = await resolveTaskExportScope(
      createUser({
        id: 'member-1',
        role: 'team_member',
      }),
      {
        status: 'completed',
      },
    );

    expect(result).toEqual({
      filters: {
        status: 'completed',
        team_id: undefined,
        assigned_to: 'member-1',
      },
      teamIds: undefined,
    });
  });

  test('rejects a team member requesting another person', async () => {
    await expect(
      resolveTaskExportScope(
        createUser({
          id: 'member-1',
          role: 'team_member',
        }),
        {
          assigned_to: 'member-2',
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  test('rejects a team member requesting a whole team', async () => {
    await expect(
      resolveTaskExportScope(
        createUser({
          id: 'member-1',
          role: 'team_member',
        }),
        {
          team_id: 'team-1',
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  test('allows a manager to export handled teams', async () => {
    const getManagedTeamsFn = jest.fn().mockResolvedValue([
      {
        id: 'team-1',
      },
      {
        id: 'team-2',
      },
    ]);

    const result = await resolveTaskExportScope(
      createUser(),
      {},
      {
        getManagedTeamsFn,
      },
    );

    expect(result).toEqual({
      filters: {},
      teamIds: ['team-1', 'team-2'],
    });
  });

  test('rejects a manager requesting an unhandled team', async () => {
    await expect(
      resolveTaskExportScope(
        createUser(),
        {
          team_id: 'team-9',
        },
        {
          getManagedTeamsFn: jest.fn().mockResolvedValue([
            {
              id: 'team-1',
            },
          ]),
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  test('allows a manager to export a member of a handled team', async () => {
    const getTeamFn = jest.fn().mockResolvedValue({
      data: {
        team: {
          id: 'team-1',
          members: [
            {
              id: 'member-1',
            },
          ],
        },
      },
    });

    const result = await resolveTaskExportScope(
      createUser(),
      {
        assigned_to: 'member-1',
      },
      {
        getManagedTeamsFn: jest.fn().mockResolvedValue([
          {
            id: 'team-1',
          },
        ]),
        getTeamFn,
      },
    );

    expect(result.teamIds).toEqual(['team-1']);
    expect(getTeamFn).toHaveBeenCalledWith('team-1');
  });

  test('rejects a manager exporting a person outside handled teams', async () => {
    await expect(
      resolveTaskExportScope(
        createUser(),
        {
          assigned_to: 'outsider-1',
        },
        {
          getManagedTeamsFn: jest.fn().mockResolvedValue([
            {
              id: 'team-1',
            },
          ]),
          getTeamFn: jest.fn().mockResolvedValue({
            data: {
              team: {
                id: 'team-1',
                members: [
                  {
                    id: 'member-1',
                  },
                ],
              },
            },
          }),
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
});
