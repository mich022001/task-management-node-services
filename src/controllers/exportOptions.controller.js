import { getTeam, getTeams } from '../clients/laravel/teamClient.js';
import { getUser, getUsers } from '../clients/laravel/userClient.js';
import { AppError } from '../errors/AppError.js';

async function getEveryPage(fetchPage, parameters = {}) {
  const records = [];
  let currentPage = 1;
  let lastPage = 1;

  do {
    const response = await fetchPage({
      ...parameters,
      page: currentPage,
      per_page: 100,
    });

    records.push(...(response.data ?? []));

    lastPage = response.meta?.last_page ?? currentPage;
    currentPage += 1;
  } while (currentPage <= lastPage);

  return records;
}

function normalizeTeam(team) {
  return {
    id: String(team.id),
    name: team.name,
  };
}

function normalizeUser(user) {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function uniqueUsers(users) {
  const usersById = new Map();

  for (const user of users) {
    if (!user?.id || user.is_active === false) {
      continue;
    }

    usersById.set(String(user.id), normalizeUser(user));
  }

  return [...usersById.values()].sort((firstUser, secondUser) =>
    firstUser.name.localeCompare(secondUser.name),
  );
}

async function getAdminOptions() {
  const [teams, users] = await Promise.all([
    getEveryPage(getTeams),
    getEveryPage(getUsers, {
      is_active: true,
    }),
  ]);

  return {
    scope: 'all',
    teams: teams.map(normalizeTeam),
    users: uniqueUsers(users),
  };
}

async function getManagerOptions(managerId) {
  const teams = await getEveryPage(getTeams, {
    managed_by: managerId,
  });

  const teamResponses = await Promise.all(
    teams.map((team) => getTeam(team.id)),
  );

  const users = teamResponses.flatMap(
    (response) => response.data?.team?.members ?? [],
  );

  return {
    scope: 'managed',
    teams: teams.map(normalizeTeam),
    users: uniqueUsers(users),
  };
}

async function getTeamMemberOptions(userId) {
  const response = await getUser(userId);
  const user = response.data?.user;

  if (!user?.id) {
    throw new AppError(
      'Laravel returned an invalid authenticated user response.',
      {
        statusCode: 502,
        code: 'INVALID_LARAVEL_RESPONSE',
      },
    );
  }

  return {
    scope: 'self',
    teams: [],
    users: [normalizeUser(user)],
  };
}

export async function getExportOptions(req, res, next) {
  try {
    let options;

    switch (req.user.role) {
      case 'admin':
        options = await getAdminOptions();
        break;

      case 'manager':
        options = await getManagerOptions(req.user.id);
        break;

      case 'team_member':
        options = await getTeamMemberOptions(req.user.id);
        break;

      default:
        throw new AppError('You are not authorized to access export options.', {
          statusCode: 403,
          code: 'FORBIDDEN',
        });
    }

    return res.status(200).json({
      message: 'Export options retrieved successfully.',
      data: options,
    });
  } catch (error) {
    return next(error);
  }
}
