import { getTasks } from '../clients/laravel/taskClient.js';
import { getTeam } from '../clients/laravel/teamClient.js';
import { AppError } from '../errors/AppError.js';
import {
  buildTaskSummary,
  buildTeamReport,
  buildUpcomingDeadlines,
} from '../services/analytics.service.js';
import {
  assertTeamAccess,
  getAuthorizedTeamIds,
  resolveAnalyticsTeamIds,
} from '../services/analyticsAuthorization.service.js';
import { buildCSV, buildJSON, buildXLSX } from '../services/export.service.js';
import { resolveTaskExportScope } from '../services/exportAuthorization.service.js';
import {
  logExportFailure,
  logExportSuccess,
} from '../services/exportAudit.service.js';
import {
  analyticsSummaryExportQuerySchema,
  deadlineExportQuerySchema,
  exportFormatSchema,
  formatExportValidationErrors,
  taskExportBodySchema,
  taskExportQuerySchema,
  teamReportExportQuerySchema,
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

const teamReportSummaryColumns = Object.freeze([
  {
    header: 'Team ID',
    key: 'team_id',
    width: 38,
  },
  {
    header: 'Team Name',
    key: 'team_name',
    width: 30,
  },
  {
    header: 'Total Tasks',
    key: 'total_tasks',
    width: 15,
  },
  {
    header: 'Completed',
    key: 'completed_tasks',
    width: 15,
  },
  {
    header: 'Unfinished',
    key: 'unfinished_tasks',
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
    header: 'Completion Rate',
    key: 'completion_rate',
    width: 18,
  },
  {
    header: 'Average Completion Days',
    key: 'average_completion_days',
    width: 25,
  },
]);

const teamReportMemberColumns = Object.freeze([
  {
    header: 'Member ID',
    key: 'member_id',
    width: 38,
  },
  {
    header: 'Member Name',
    key: 'member_name',
    width: 30,
  },
  {
    header: 'Email',
    key: 'member_email',
    width: 35,
  },
  {
    header: 'Member Role',
    key: 'member_role',
    width: 18,
  },
  {
    header: 'Assigned Tasks',
    key: 'assigned_tasks',
    width: 18,
  },
  {
    header: 'Completed',
    key: 'completed_tasks',
    width: 15,
  },
  {
    header: 'Unfinished',
    key: 'unfinished_tasks',
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
    header: 'Completion Rate',
    key: 'completion_rate',
    width: 18,
  },
  {
    header: 'Average Completion Days',
    key: 'average_completion_days',
    width: 25,
  },
]);

const teamReportTaskColumns = Object.freeze([
  {
    header: 'Team ID',
    key: 'team_id',
    width: 38,
  },
  {
    header: 'Team Name',
    key: 'team_name',
    width: 30,
  },
  {
    header: 'Member ID',
    key: 'member_id',
    width: 38,
  },
  {
    header: 'Member Name',
    key: 'member_name',
    width: 30,
  },
  {
    header: 'Member Email',
    key: 'member_email',
    width: 35,
  },
  {
    header: 'Task ID',
    key: 'task_id',
    width: 38,
  },
  {
    header: 'Task Title',
    key: 'task_title',
    width: 40,
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
    header: 'Created Date',
    key: 'created_at',
    width: 25,
  },
  {
    header: 'Due Date',
    key: 'due_date',
    width: 25,
  },
  {
    header: 'Completed Date',
    key: 'completed_at',
    width: 25,
  },
  {
    header: 'Completion Days',
    key: 'completion_days',
    width: 18,
  },
  {
    header: 'Overdue',
    key: 'is_overdue',
    width: 12,
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

function flattenTeamReportSummary(report) {
  return {
    team_id: report.team.id,
    team_name: report.team.name,
    ...report.summary,
  };
}

function flattenTeamReportMembers(report) {
  return report.members.map((member) => ({
    member_id: member.user_id,
    member_name: member.name,
    member_email: member.email,
    member_role: member.member_role,
    assigned_tasks: member.summary.assigned_tasks,
    completed_tasks: member.summary.completed_tasks,
    unfinished_tasks: member.summary.unfinished_tasks,
    cancelled_tasks: member.summary.cancelled_tasks,
    overdue_tasks: member.summary.overdue_tasks,
    completion_rate: member.summary.completion_rate,
    average_completion_days: member.summary.average_completion_days,
  }));
}

function flattenTeamReportTasks(report) {
  const memberRows = report.members.flatMap((member) =>
    member.tasks.map((task) => ({
      team_id: report.team.id,
      team_name: report.team.name,
      member_id: member.user_id,
      member_name: member.name,
      member_email: member.email,
      task_id: task.id,
      task_title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      created_at: task.created_at,
      due_date: task.due_date,
      completed_at: task.completed_at,
      completion_days: task.completion_days,
      is_overdue: task.is_overdue,
    })),
  );

  const unassignedRows = report.unassigned_tasks.map((task) => ({
    team_id: report.team.id,
    team_name: report.team.name,
    member_id: null,
    member_name: 'Unassigned',
    member_email: null,
    task_id: task.id,
    task_title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    created_at: task.created_at,
    due_date: task.due_date,
    completed_at: task.completed_at,
    completion_days: task.completion_days,
    is_overdue: task.is_overdue,
  }));

  return [...memberRows, ...unassignedRows];
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
    format:
      req.method === 'POST'
        ? (req.body?.format ?? 'unknown')
        : (req.params.format ?? 'unknown'),
  });

  try {
    let format;
    let filters;

    if (req.method === 'POST') {
      const requestData = validateRequest(taskExportBodySchema, req.body);

      format = requestData.format;
      filters = requestData.filters;
    } else {
      const params = validateRequest(exportFormatSchema, req.params);

      format = params.format;
      filters = validateRequest(taskExportQuerySchema, req.query);
    }

    const scope = await resolveTaskExportScope(req.user, filters);

    const effectiveFilters = scope.filters;
    const teamIds = scope.teamIds;

    auditContext = createAuditContext({
      user: req.user,
      resource: 'tasks',
      format,
      filters: {
        ...effectiveFilters,
        authorized_team_ids: teamIds ?? null,
      },
    });

    const taskQuery = Object.fromEntries(
      Object.entries(effectiveFilters).filter(
        ([, value]) => value !== undefined && value !== null && value !== '',
      ),
    );

    const tasks = await getAllTasks(taskQuery);

    const scopedTasks = filterTasksByTeamIds(tasks, teamIds);

    const filename = buildFilename('tasks', format);

    auditContext.filename = filename;

    const buffer = await buildFormattedExport({
      format,
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
      format,
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

export async function exportTeamReport(req, res, next) {
  let auditContext = createAuditContext({
    user: req.user,
    resource: 'team_report',
    format: req.params.format ?? 'unknown',
  });

  try {
    const params = validateRequest(exportFormatSchema, req.params);

    const query = validateRequest(teamReportExportQuerySchema, req.query);

    const authorizedTeamIds = await getAuthorizedTeamIds(req.user);

    assertTeamAccess(req.user, query.team_id, authorizedTeamIds);

    auditContext = createAuditContext({
      user: req.user,
      resource: 'team_report',
      format: params.format,
      filters: {
        team_id: query.team_id,
        date_from: query.date_from ?? null,
        date_to: query.date_to ?? null,
        date_field: query.date_field,
        member_ids: query.member_ids,
        statuses: query.statuses,
        priorities: query.priorities,
      },
    });

    const [teamResponse, tasks] = await Promise.all([
      getTeam(query.team_id),
      getAllTasks({
        team_id: query.team_id,
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

    const summaryRows = [flattenTeamReportSummary(report)];

    const memberRows = flattenTeamReportMembers(report);

    const taskRows = flattenTeamReportTasks(report);

    const filename = buildFilename('team-report', params.format);

    auditContext.filename = filename;

    let buffer;

    if (params.format === 'json') {
      buffer = buildJSON({
        message: 'Team report exported successfully.',
        data: report,
        meta: {
          record_count: taskRows.length,
        },
      });
    } else if (params.format === 'csv') {
      buffer = buildCSV({
        columns: teamReportTaskColumns,
        rows: taskRows,
      });
    } else {
      buffer = await buildXLSX({
        worksheets: [
          {
            worksheetName: 'Team Summary',
            columns: teamReportSummaryColumns,
            rows: summaryRows,
          },
          {
            worksheetName: 'Member Summary',
            columns: teamReportMemberColumns,
            rows: memberRows,
          },
          {
            worksheetName: 'Task Details',
            columns: teamReportTaskColumns,
            rows: taskRows,
          },
        ],
      });
    }

    setDownloadHeaders(res, {
      format: params.format,
      filename,
      contentLength: buffer.length,
    });

    logExportSuccess({
      ...auditContext,
      recordCount: taskRows.length,
    });

    return res.status(200).send(buffer);
  } catch (error) {
    recordExportFailure(auditContext, error);

    return next(error);
  }
}
