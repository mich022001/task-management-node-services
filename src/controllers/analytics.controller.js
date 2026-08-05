import {
  getCachedAnalytics,
  setCachedAnalytics,
} from '../cache/analytics.cache.js';
import { getTask, getTasks } from '../clients/laravel/taskClient.js';
import { getTeam, getTeams } from '../clients/laravel/teamClient.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';
import {
  buildTaskSummary,
  buildTeamHighlights,
  buildTeamProductivity,
  buildTeamReport,
  buildUpcomingDeadlines,
} from '../services/analytics.service.js';
import {
  assertTeamAccess,
  getAuthorizedTeamIds,
  resolveAnalyticsTeamIds,
} from '../services/analyticsAuthorization.service.js';
import {
  formatValidationErrors,
  taskSummaryQuerySchema,
  teamProductivityParamsSchema,
  teamReportParamsSchema,
  teamReportQuerySchema,
  upcomingDeadlinesQuerySchema,
} from '../validation/analytics.schema.js';

async function getAllTasks(params = {}) {
  const tasks = [];
  let currentPage = 1;
  let lastPage = 1;

  do {
    const response = await getTasks({
      ...params,
      page: currentPage,
      per_page: 100,
    });

    tasks.push(...(response.data ?? []));

    lastPage = response.meta?.last_page ?? currentPage;
    currentPage += 1;
  } while (currentPage <= lastPage);

  return tasks;
}

async function getAllTeams(params = {}) {
  const teams = [];
  let currentPage = 1;
  let lastPage = 1;

  do {
    const response = await getTeams({
      ...params,
      page: currentPage,
      per_page: 100,
    });

    teams.push(...(response.data ?? []));

    lastPage = response.meta?.last_page ?? currentPage;

    currentPage += 1;
  } while (currentPage <= lastPage);

  return teams;
}

function validateRequest(schema, value) {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new AppError('Analytics request validation failed.', {
      statusCode: 422,
      code: 'VALIDATION_FAILED',
      errors: formatValidationErrors(result.error),
    });
  }

  return result.data;
}

function buildUserScope(authenticatedUser, teamIds) {
  if (authenticatedUser.role === 'admin') {
    return teamIds === undefined ? 'admin:all' : `admin:${teamIds.join(',')}`;
  }

  if (authenticatedUser.role === 'team_member') {
    return `team-member:${authenticatedUser.id}`;
  }

  return [
    'manager',
    authenticatedUser.id,
    teamIds.length === 0 ? 'none' : teamIds.join(','),
  ].join(':');
}

function getFromCache(cacheKey, requestContext) {
  const cachedValue = getCachedAnalytics(cacheKey);

  if (cachedValue === undefined) {
    logger.info(
      {
        ...requestContext,
        cacheKey,
        cacheStatus: 'miss',
      },
      'Analytics cache miss.',
    );

    return undefined;
  }

  logger.info(
    {
      ...requestContext,
      cacheKey,
      cacheStatus: 'hit',
    },
    'Analytics cache hit.',
  );

  return cachedValue;
}

function storeInCache(cacheKey, value, requestContext) {
  setCachedAnalytics(cacheKey, value);

  logger.info(
    {
      ...requestContext,
      cacheKey,
      cacheStatus: 'stored',
    },
    'Analytics result stored in cache.',
  );

  return value;
}

export async function getDashboardAnalytics(req, res, next) {
  try {
    const query = validateRequest(upcomingDeadlinesQuerySchema, req.query);

    const requestContext = {
      analyticsType: 'dashboard',
      userId: req.user.id,
      role: req.user.role,
      days: query.days,
      requestedTeamId: query.team_id,
    };

    const cacheKey = [
      'analytics',
      'dashboard',
      `user:${req.user.id}`,
      `role:${req.user.role}`,
      `team:${query.team_id ?? 'all'}`,
      `days:${query.days}`,
    ].join(':');

    const cachedResult = getFromCache(cacheKey, requestContext);

    if (cachedResult !== undefined) {
      return res.status(200).json({
        message: 'Dashboard analytics retrieved successfully.',
        data: cachedResult,
        meta: {
          cached: true,
        },
      });
    }

    let teams = [];
    let tasks = [];
    let teamIds;

    if (req.user.role === 'team_member') {
      if (query.team_id !== undefined) {
        throw new AppError(
          'Team Members cannot request team-scoped analytics.',
          {
            statusCode: 403,
            code: 'FORBIDDEN',
          },
        );
      }

      tasks = await getAllTasks({
        assigned_to: req.user.id,
      });
    } else {
      const teamQuery =
        req.user.role === 'manager'
          ? {
              user_id: req.user.id,
            }
          : {};

      [teams, tasks] = await Promise.all([
        getAllTeams(teamQuery),
        getAllTasks(),
      ]);

      const authorizedTeamIds = teams.map((team) => String(team.id)).sort();

      if (query.team_id !== undefined) {
        const requestedTeamId = String(query.team_id);

        if (
          req.user.role === 'manager' &&
          !authorizedTeamIds.includes(requestedTeamId)
        ) {
          throw new AppError(
            'You are not authorized to view analytics for this team.',
            {
              statusCode: 403,
              code: 'FORBIDDEN',
            },
          );
        }

        teamIds = [requestedTeamId];

        teams = teams.filter((team) => String(team.id) === requestedTeamId);
      } else {
        teamIds = req.user.role === 'admin' ? undefined : authorizedTeamIds;
      }
    }

    const summary = buildTaskSummary(tasks, {
      teamIds,
    });

    const deadlines = buildUpcomingDeadlines(tasks, {
      days: query.days,
      teamIds,
    });

    const highlights =
      req.user.role === 'team_member'
        ? {
            teams: [],
            totals: {
              teams: 0,
              members: 0,
              tasks: 0,
              overdue: 0,
              high_priority: 0,
              high_priority_overdue: 0,
            },
          }
        : buildTeamHighlights(teams, tasks);

    const dashboard = {
      summary,
      deadlines,
      team_highlights: highlights,
    };

    storeInCache(cacheKey, dashboard, requestContext);

    return res.status(200).json({
      message: 'Dashboard analytics retrieved successfully.',
      data: dashboard,
      meta: {
        cached: false,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function getTaskSummary(req, res, next) {
  try {
    const query = validateRequest(taskSummaryQuerySchema, req.query);

    const authorizedTeamIds = await getAuthorizedTeamIds(req.user);

    const teamIds = resolveAnalyticsTeamIds({
      authenticatedUser: req.user,
      requestedTeamId: query.team_id,
      authorizedTeamIds,
    });

    const userScope = buildUserScope(req.user, teamIds);
    const cacheKey = `analytics:task-summary:${userScope}`;

    const requestContext = {
      analyticsType: 'task_summary',
      userId: req.user.id,
      role: req.user.role,
      teamIds,
    };

    const cachedResult = getFromCache(cacheKey, requestContext);

    if (cachedResult !== undefined) {
      return res.status(200).json({
        message: 'Task summary retrieved successfully.',
        data: cachedResult,
        meta: {
          cached: true,
        },
      });
    }

    const tasks =
      req.user.role === 'team_member'
        ? await getAllTasks({
            assigned_to: req.user.id,
          })
        : await getAllTasks();

    const summary = buildTaskSummary(tasks, {
      teamIds,
    });

    storeInCache(cacheKey, summary, requestContext);

    return res.status(200).json({
      message: 'Task summary retrieved successfully.',
      data: summary,
      meta: {
        cached: false,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function getTeamProductivity(req, res, next) {
  try {
    const params = validateRequest(teamProductivityParamsSchema, req.params);

    const teamId = params.teamId;

    const authorizedTeamIds = await getAuthorizedTeamIds(req.user);

    assertTeamAccess(req.user, teamId, authorizedTeamIds);

    const cacheKey = [
      'analytics',
      'team-productivity',
      `user:${req.user.id}`,
      `role:${req.user.role}`,
      `team:${teamId}`,
    ].join(':');

    const requestContext = {
      analyticsType: 'team_productivity',
      userId: req.user.id,
      role: req.user.role,
      teamId,
    };

    const cachedResult = getFromCache(cacheKey, requestContext);

    if (cachedResult !== undefined) {
      return res.status(200).json({
        message: 'Team productivity retrieved successfully.',
        data: cachedResult,
        meta: {
          cached: true,
        },
      });
    }

    const teamResponse = await getTeam(teamId);

    const tasks = await getAllTasks({
      team_id: teamId,
    });

    const team = teamResponse.data?.team;

    if (!team) {
      throw new AppError('Laravel returned an invalid team response.', {
        statusCode: 502,
        code: 'INVALID_LARAVEL_RESPONSE',
      });
    }

    const productivity = buildTeamProductivity(team, tasks);

    storeInCache(cacheKey, productivity, requestContext);

    return res.status(200).json({
      message: 'Team productivity retrieved successfully.',
      data: productivity,
      meta: {
        cached: false,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function getUpcomingDeadlines(req, res, next) {
  try {
    const query = validateRequest(upcomingDeadlinesQuerySchema, req.query);

    const authorizedTeamIds = await getAuthorizedTeamIds(req.user);

    const teamIds = resolveAnalyticsTeamIds({
      authenticatedUser: req.user,
      requestedTeamId: query.team_id,
      authorizedTeamIds,
    });

    const userScope = buildUserScope(req.user, teamIds);

    const cacheKey = [
      'analytics',
      'upcoming-deadlines',
      userScope,
      `days:${query.days}`,
    ].join(':');

    const requestContext = {
      analyticsType: 'upcoming_deadlines',
      userId: req.user.id,
      role: req.user.role,
      teamIds,
      days: query.days,
    };

    const cachedResult = getFromCache(cacheKey, requestContext);

    if (cachedResult !== undefined) {
      return res.status(200).json({
        message: 'Upcoming deadlines retrieved successfully.',
        data: cachedResult,
        meta: {
          cached: true,
        },
      });
    }

    const tasks =
      req.user.role === 'team_member'
        ? await getAllTasks({
            assigned_to: req.user.id,
          })
        : await getAllTasks();

    const deadlines = buildUpcomingDeadlines(tasks, {
      days: query.days,
      teamIds,
    });

    storeInCache(cacheKey, deadlines, requestContext);

    return res.status(200).json({
      message: 'Upcoming deadlines retrieved successfully.',
      data: deadlines,
      meta: {
        cached: false,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function getTaskDetailForAnalytics(taskId) {
  return getTask(taskId);
}

export async function getTeamReport(req, res, next) {
  try {
    const params = validateRequest(teamReportParamsSchema, req.params);

    const query = validateRequest(teamReportQuerySchema, req.query);

    const teamId = params.teamId;

    const authorizedTeamIds = await getAuthorizedTeamIds(req.user);

    assertTeamAccess(req.user, teamId, authorizedTeamIds);

    const cacheKey = [
      'analytics',
      'team-report',
      `user:${req.user.id}`,
      `role:${req.user.role}`,
      `team:${teamId}`,
      `date-field:${query.date_field}`,
      `date-from:${query.date_from ?? 'none'}`,
      `date-to:${query.date_to ?? 'none'}`,
      `members:${query.member_ids.join(',') || 'all'}`,
      `statuses:${query.statuses.join(',') || 'all'}`,
      `priorities:${query.priorities.join(',') || 'all'}`,
    ].join(':');

    const requestContext = {
      analyticsType: 'team_report',
      userId: req.user.id,
      role: req.user.role,
      teamId,
      filters: query,
    };

    const cachedResult = getFromCache(cacheKey, requestContext);

    if (cachedResult !== undefined) {
      return res.status(200).json({
        message: 'Team report retrieved successfully.',
        data: cachedResult,
        meta: {
          cached: true,
        },
      });
    }

    const [teamResponse, tasks] = await Promise.all([
      getTeam(teamId),
      getAllTasks({
        team_id: teamId,
      }),
    ]);

    const team = teamResponse.data?.team;

    if (!team) {
      throw new AppError('Laravel returned an invalid team response.', {
        statusCode: 502,
        code: 'INVALID_LARAVEL_RESPONSE',
      });
    }

    const teamMemberIds = new Set(
      (team.members ?? []).map((member) => String(member.id)),
    );

    const invalidMemberIds = query.member_ids.filter(
      (memberId) => !teamMemberIds.has(String(memberId)),
    );

    if (invalidMemberIds.length > 0) {
      throw new AppError(
        'One or more selected members do not belong to this team.',
        {
          statusCode: 422,
          code: 'VALIDATION_FAILED',
          errors: {
            member_ids: [
              'Every selected member must belong to the requested team.',
            ],
          },
        },
      );
    }

    const report = buildTeamReport(team, tasks, {
      dateField: query.date_field,
      dateFrom: query.date_from,
      dateTo: query.date_to,
      memberIds: query.member_ids,
      statuses: query.statuses,
      priorities: query.priorities,
    });

    storeInCache(cacheKey, report, requestContext);

    return res.status(200).json({
      message: 'Team report retrieved successfully.',
      data: report,
      meta: {
        cached: false,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function getTeamHighlights(req, res, next) {
  try {
    const authorizedTeamIds = await getAuthorizedTeamIds(req.user);

    const userScope = buildUserScope(req.user, authorizedTeamIds);

    const cacheKey = ['analytics', 'team-highlights', userScope].join(':');

    const requestContext = {
      analyticsType: 'team_highlights',
      userId: req.user.id,
      role: req.user.role,
      authorizedTeamIds,
    };

    const cachedResult = getFromCache(cacheKey, requestContext);

    if (cachedResult !== undefined) {
      return res.status(200).json({
        message: 'Team highlights retrieved successfully.',
        data: cachedResult,
        meta: {
          cached: true,
        },
      });
    }

    const teamQuery =
      req.user.role === 'manager'
        ? {
            user_id: req.user.id,
          }
        : {};

    const [teams, tasks] = await Promise.all([
      getAllTeams(teamQuery),
      getAllTasks(),
    ]);

    const authorizedTeams =
      authorizedTeamIds === undefined
        ? teams
        : teams.filter((team) =>
            authorizedTeamIds.some(
              (teamId) => String(teamId) === String(team.id),
            ),
          );

    const highlights = buildTeamHighlights(authorizedTeams, tasks);

    storeInCache(cacheKey, highlights, requestContext);

    return res.status(200).json({
      message: 'Team highlights retrieved successfully.',
      data: highlights,
      meta: {
        cached: false,
      },
    });
  } catch (error) {
    return next(error);
  }
}
