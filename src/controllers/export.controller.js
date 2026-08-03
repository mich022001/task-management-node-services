import { getTasks } from '../clients/laravel/taskClient.js';
import { AppError } from '../errors/AppError.js';
import {
  buildTaskSummary,
  buildUpcomingDeadlines,
} from '../services/analytics.service.js';
import {
  getAuthorizedTeamIds,
  resolveAnalyticsTeamIds,
} from '../services/analyticsAuthorization.service.js';
import { buildCSV, buildJSON, buildXLSX } from '../services/export.service.js';
import {
  logExportFailure,
  logExportSuccess,
} from '../services/exportAudit.service.js';
import {
  analyticsSummaryExportQuerySchema,
  deadlineExportQuerySchema,
  exportFormatSchema,
  formatExportValidationErrors,
  taskExportQuerySchema,
} from '../validation/export.schema.js';

const taskColumns = Object.freeze([
  {
    header: 'ID',
    key: 'id',
    width: 10,
  },
  {
    header: 'Team ID',
    key: 'team_id',
    width: 12,
  },
  {
    header: 'Title',
    key: 'title',
    width: 35,
  },
  {
    header: 'Description',
    key: 'description',
    width: 50,
  },
  {
    header: 'Status',
    key: 'status',
    width: 18,
  },
  {
    header: 'Priority',
    key: 'priority',
    width: 15,
  },
  {
    header: 'Assigned To',
    key: 'assigned_to',
    width: 15,
  },
  {
    header: 'Created By',
    key: 'created_by',
    width: 15,
  },
  {
    header: 'Due Date',
    key: 'due_date',
    width: 25,
  },
  {
    header: 'Completed At',
    key: 'completed_at',
    width: 25,
  },
  {
    header: 'Created At',
    key: 'created_at',
    width: 25,
  },
  {
    header: 'Updated At',
    key: 'updated_at',
    width: 25,
  },
]);

const taskSummaryColumns = Object.freeze([
  {
    header: 'Total Tasks',
    key: 'total_tasks',
    width: 15,
  },
  {
    header: 'Pending',
    key: 'pending_tasks',
    width: 15,
  },
  {
    header: 'In Progress',
    key: 'in_progress_tasks',
    width: 15,
  },
  {
    header: 'Completed',
    key: 'completed_tasks',
    width: 15,
  },
  {
    header: 'Cancelled',
    key: 'cancelled_tasks',
    width: 15,
  },
  {
    header: 'Overdue',
    key: 'overdue_tasks',
    width: 15,
  },
  {
    header: 'Low Priority',
    key: 'low_priority_tasks',
    width: 15,
  },
  {
    header: 'Medium Priority',
    key: 'medium_priority_tasks',
    width: 18,
  },
  {
    header: 'High Priority',
    key: 'high_priority_tasks',
    width: 15,
  },
  {
    header: 'Completion Rate',
    key: 'completion_rate',
    width: 18,
  },
]);

const deadlineColumns = Object.freeze([
  {
    header: 'Category',
    key: 'category',
    width: 15,
  },
  {
    header: 'ID',
    key: 'id',
    width: 10,
  },
  {
    header: 'Title',
    key: 'title',
    width: 35,
  },
  {
    header: 'Team ID',
    key: 'team_id',
    width: 12,
  },
  {
    header: 'Assigned To',
    key: 'assigned_to',
    width: 15,
  },
  {
    header: 'Status',
    key: 'status',
    width: 18,
  },
  {
    header: 'Priority',
    key: 'priority',
    width: 15,
  },
  {
    header: 'Due Date',
    key: 'due_date',
    width: 25,
  },
]);

const exportContentTypes = Object.freeze({
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});

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
    throw new AppError('Export request validation failed.', {
      statusCode: 422,
      code: 'VALIDATION_FAILED',
      errors: formatExportValidationErrors(result.error),
    });
  }

  return result.data;
}

function filterTasksByTeamIds(tasks, teamIds) {
  if (teamIds === undefined) {
    return tasks;
  }

  const authorizedTeamIds = new Set(teamIds.map(String));

  return tasks.filter((task) => authorizedTeamIds.has(String(task.team_id)));
}

function buildFilename(resource, format) {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-');

  return `${resource}-${timestamp}.${format}`;
}

function setDownloadHeaders(res, { format, filename, contentLength }) {
  res.set({
    'Content-Type': exportContentTypes[format],
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': String(contentLength),
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
  });
}

function flattenTaskSummary(summary) {
  return {
    total_tasks: summary.total_tasks,
    pending_tasks: summary.status.pending,
    in_progress_tasks: summary.status.in_progress,
    completed_tasks: summary.status.completed,
    cancelled_tasks: summary.status.cancelled,
    overdue_tasks: summary.overdue_tasks,
    low_priority_tasks: summary.priority.low,
    medium_priority_tasks: summary.priority.medium,
    high_priority_tasks: summary.priority.high,
    completion_rate: summary.completion_rate,
  };
}

function flattenDeadlines(deadlines) {
  return [
    ...deadlines.overdue.map((task) => ({
      category: 'overdue',
      ...task,
    })),
    ...deadlines.upcoming.map((task) => ({
      category: 'upcoming',
      ...task,
    })),
  ];
}

async function buildFormattedExport({
  format,
  worksheetName,
  columns,
  rows,
  jsonPayload,
}) {
  if (format === 'csv') {
    return buildCSV({
      columns,
      rows,
    });
  }

  if (format === 'json') {
    return buildJSON(jsonPayload);
  }

  if (format === 'xlsx') {
    return buildXLSX({
      worksheetName,
      columns,
      rows,
    });
  }

  throw new AppError('Unsupported export format.', {
    statusCode: 422,
    code: 'VALIDATION_FAILED',
  });
}

async function resolveExportTeamIds(user, requestedTeamId) {
  const authorizedTeamIds = await getAuthorizedTeamIds(user);

  return resolveAnalyticsTeamIds({
    authenticatedUser: user,
    requestedTeamId,
    authorizedTeamIds,
  });
}

function createAuditContext({ user, resource, format, filters = {} }) {
  return {
    user,
    resource,
    format,
    filters,
    filename: null,
  };
}

function recordExportFailure(auditContext, error) {
  if (!auditContext.user?.id) {
    return;
  }

  logExportFailure({
    ...auditContext,
    error,
  });
}

export async function exportTasks(req, res, next) {
  let auditContext = createAuditContext({
    user: req.user,
    resource: 'tasks',
    format: req.params.format ?? 'unknown',
  });

  try {
    const params = validateRequest(exportFormatSchema, req.params);
    const query = validateRequest(taskExportQuerySchema, req.query);

    const teamIds = await resolveExportTeamIds(req.user, query.team_id);

    auditContext = createAuditContext({
      user: req.user,
      resource: 'tasks',
      format: params.format,
      filters: {
        team_id: query.team_id ?? null,
        authorized_team_ids: teamIds ?? null,
      },
    });

    const taskQuery =
      query.team_id === undefined
        ? {}
        : {
            team_id: query.team_id,
          };

    const tasks = await getAllTasks(taskQuery);
    const scopedTasks = filterTasksByTeamIds(tasks, teamIds);

    const filename = buildFilename('tasks', params.format);
    auditContext.filename = filename;

    const buffer = await buildFormattedExport({
      format: params.format,
      worksheetName: 'Tasks',
      columns: taskColumns,
      rows: scopedTasks,
      jsonPayload: {
        message: 'Tasks exported successfully.',
        data: scopedTasks,
        meta: {
          record_count: scopedTasks.length,
        },
      },
    });

    setDownloadHeaders(res, {
      format: params.format,
      filename,
      contentLength: buffer.length,
    });

    logExportSuccess({
      ...auditContext,
      recordCount: scopedTasks.length,
    });

    return res.status(200).send(buffer);
  } catch (error) {
    recordExportFailure(auditContext, error);

    return next(error);
  }
}

export async function exportTaskSummary(req, res, next) {
  let auditContext = createAuditContext({
    user: req.user,
    resource: 'analytics_summary',
    format: req.params.format ?? 'unknown',
  });

  try {
    const params = validateRequest(exportFormatSchema, req.params);

    const query = validateRequest(analyticsSummaryExportQuerySchema, req.query);

    const teamIds = await resolveExportTeamIds(req.user, query.team_id);

    auditContext = createAuditContext({
      user: req.user,
      resource: 'analytics_summary',
      format: params.format,
      filters: {
        team_id: query.team_id ?? null,
        authorized_team_ids: teamIds ?? null,
      },
    });

    const tasks = await getAllTasks();

    const summary = buildTaskSummary(tasks, {
      teamIds,
    });

    const rows = [flattenTaskSummary(summary)];

    const filename = buildFilename('analytics-summary', params.format);

    auditContext.filename = filename;

    const buffer = await buildFormattedExport({
      format: params.format,
      worksheetName: 'Task Summary',
      columns: taskSummaryColumns,
      rows,
      jsonPayload: {
        message: 'Task summary exported successfully.',
        data: summary,
        meta: {
          record_count: rows.length,
        },
      },
    });

    setDownloadHeaders(res, {
      format: params.format,
      filename,
      contentLength: buffer.length,
    });

    logExportSuccess({
      ...auditContext,
      recordCount: rows.length,
    });

    return res.status(200).send(buffer);
  } catch (error) {
    recordExportFailure(auditContext, error);

    return next(error);
  }
}

export async function exportUpcomingDeadlines(req, res, next) {
  let auditContext = createAuditContext({
    user: req.user,
    resource: 'upcoming_deadlines',
    format: req.params.format ?? 'unknown',
  });

  try {
    const params = validateRequest(exportFormatSchema, req.params);
    const query = validateRequest(deadlineExportQuerySchema, req.query);

    const teamIds = await resolveExportTeamIds(req.user, query.team_id);

    auditContext = createAuditContext({
      user: req.user,
      resource: 'upcoming_deadlines',
      format: params.format,
      filters: {
        team_id: query.team_id ?? null,
        days: query.days,
        authorized_team_ids: teamIds ?? null,
      },
    });

    const tasks = await getAllTasks();

    const deadlines = buildUpcomingDeadlines(tasks, {
      days: query.days,
      teamIds,
    });

    const rows = flattenDeadlines(deadlines);

    const filename = buildFilename('upcoming-deadlines', params.format);

    auditContext.filename = filename;

    const buffer = await buildFormattedExport({
      format: params.format,
      worksheetName: 'Upcoming Deadlines',
      columns: deadlineColumns,
      rows,
      jsonPayload: {
        message: 'Upcoming deadlines exported successfully.',
        data: deadlines,
        meta: {
          record_count: rows.length,
        },
      },
    });

    setDownloadHeaders(res, {
      format: params.format,
      filename,
      contentLength: buffer.length,
    });

    logExportSuccess({
      ...auditContext,
      recordCount: rows.length,
    });

    return res.status(200).send(buffer);
  } catch (error) {
    recordExportFailure(auditContext, error);

    return next(error);
  }
}
