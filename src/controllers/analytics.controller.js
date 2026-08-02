import {
  getCachedAnalytics,
  setCachedAnalytics,
} from '../cache/analytics.cache.js';
import { getTask, getTasks } from '../clients/laravel/taskClient.js';
import { getTeam } from '../clients/laravel/teamClient.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';
import {
  buildTaskSummary,
  buildTeamProductivity,
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

    const tasks = await getAllTasks();

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

    const tasks = await getAllTasks();

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
