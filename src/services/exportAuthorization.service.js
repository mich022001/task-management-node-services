import { getTeam, getTeams } from '../clients/laravel/teamClient.js';
import { AppError } from '../errors/AppError.js';

async function getManagedTeams(managerId) {
  const teams = [];
  let currentPage = 1;
  let lastPage = 1;

  do {
    const response = await getTeams({
      managed_by: managerId,
      page: currentPage,
      per_page: 100,
    });

    teams.push(...(response.data ?? []));

    lastPage = response.meta?.last_page ?? currentPage;
    currentPage += 1;
  } while (currentPage <= lastPage);

  return teams;
}

function forbidden(message) {
  return new AppError(message, {
    statusCode: 403,
    code: 'FORBIDDEN',
  });
}

async function assertMemberBelongsToTeams(
  memberId,
  teamIds,
  { getTeamFn = getTeam } = {},
) {
  for (const teamId of teamIds) {
    const response = await getTeamFn(teamId);
    const team = response.data?.team;

    if (!team) {
      throw new AppError('Laravel returned an invalid team response.', {
        statusCode: 502,
        code: 'INVALID_LARAVEL_RESPONSE',
      });
    }

    const belongsToTeam = (team.members ?? []).some(
      (member) => String(member.id) === String(memberId),
    );

    if (belongsToTeam) {
      return;
    }
  }

  throw forbidden(
    'You cannot export task data for a user outside the teams you handle.',
  );
}

export async function resolveTaskExportScope(
  authenticatedUser,
  requestedFilters,
  { getManagedTeamsFn = getManagedTeams, getTeamFn = getTeam } = {},
) {
  if (!authenticatedUser?.id) {
    throw new AppError('Authentication is required.', {
      statusCode: 401,
      code: 'AUTHENTICATION_REQUIRED',
    });
  }

  const filters = {
    ...requestedFilters,
  };

  if (authenticatedUser.role === 'admin') {
    return {
      filters,
      teamIds:
        filters.team_id === undefined ? undefined : [String(filters.team_id)],
    };
  }

  if (authenticatedUser.role === 'team_member') {
    if (filters.team_id !== undefined) {
      throw forbidden('Team Members cannot export team-wide task data.');
    }

    if (
      filters.assigned_to !== undefined &&
      String(filters.assigned_to) !== String(authenticatedUser.id)
    ) {
      throw forbidden('Team Members can only export their own assigned tasks.');
    }

    return {
      filters: {
        ...filters,
        team_id: undefined,
        assigned_to: String(authenticatedUser.id),
      },
      teamIds: undefined,
    };
  }

  if (authenticatedUser.role !== 'manager') {
    throw forbidden('You are not authorized to export task data.');
  }

  const managedTeams = await getManagedTeamsFn(authenticatedUser.id);

  const managedTeamIds = [
    ...new Set(managedTeams.map((team) => String(team.id))),
  ].sort();

  if (
    filters.team_id !== undefined &&
    !managedTeamIds.includes(String(filters.team_id))
  ) {
    throw forbidden(
      'You cannot export task data for a team you do not handle.',
    );
  }

  const effectiveTeamIds =
    filters.team_id === undefined ? managedTeamIds : [String(filters.team_id)];

  if (filters.assigned_to !== undefined) {
    await assertMemberBelongsToTeams(filters.assigned_to, effectiveTeamIds, {
      getTeamFn,
    });
  }

  return {
    filters,
    teamIds: effectiveTeamIds,
  };
}
