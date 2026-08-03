import { getTeams } from '../clients/laravel/teamClient.js';
import { AppError } from '../errors/AppError.js';

async function getTeamsForUser(userId) {
  const teams = [];
  let currentPage = 1;
  let lastPage = 1;

  do {
    const response = await getTeams({
      user_id: userId,
      page: currentPage,
      per_page: 100,
    });

    teams.push(...(response.data ?? []));

    lastPage = response.meta?.last_page ?? currentPage;
    currentPage += 1;
  } while (currentPage <= lastPage);

  return teams;
}

export async function getAuthorizedTeamIds(
  authenticatedUser,
  { getTeamsForUserFn = getTeamsForUser } = {},
) {
  if (!authenticatedUser) {
    throw new AppError('Authentication is required.', {
      statusCode: 401,
      code: 'AUTHENTICATION_REQUIRED',
    });
  }

  if (authenticatedUser.role === 'admin') {
    return undefined;
  }

  if (authenticatedUser.role === 'team_member') {
    return [];
  }

  if (authenticatedUser.role !== 'manager') {
    throw new AppError('You are not authorized to access analytics.', {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  const teams = await getTeamsForUserFn(authenticatedUser.id);

  return [...new Set(teams.map((team) => String(team.id)))].sort();
}

export function assertTeamAccess(authenticatedUser, teamId, authorizedTeamIds) {
  if (!authenticatedUser) {
    throw new AppError('Authentication is required.', {
      statusCode: 401,
      code: 'AUTHENTICATION_REQUIRED',
    });
  }

  if (authenticatedUser.role === 'admin') {
    return;
  }

  if (authenticatedUser.role !== 'manager') {
    throw new AppError('You are not authorized to access analytics.', {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  const normalizedTeamId = String(teamId);

  const hasAccess = (authorizedTeamIds ?? []).some(
    (authorizedTeamId) => String(authorizedTeamId) === normalizedTeamId,
  );

  if (!hasAccess) {
    throw new AppError(
      'You are not authorized to view analytics for this team.',
      {
        statusCode: 403,
        code: 'FORBIDDEN',
      },
    );
  }
}

export function resolveAnalyticsTeamIds({
  authenticatedUser,
  requestedTeamId,
  authorizedTeamIds,
}) {
  if (authenticatedUser.role === 'admin') {
    return requestedTeamId === undefined
      ? undefined
      : [String(requestedTeamId)];
  }

  if (authenticatedUser.role === 'team_member') {
    if (requestedTeamId !== undefined) {
      throw new AppError('Team Members cannot request team-scoped analytics.', {
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    }

    return undefined;
  }

  if (requestedTeamId !== undefined) {
    assertTeamAccess(authenticatedUser, requestedTeamId, authorizedTeamIds);

    return [String(requestedTeamId)];
  }

  return authorizedTeamIds ?? [];
}
