import { getTasks } from '../clients/laravel/taskClient.js';
import { getUser } from '../clients/laravel/userClient.js';
import { logger } from '../config/logger.js';
import {
  enqueueNotification,
  processQueue,
} from '../queues/notification.queue.js';
import { buildTaskSummary } from '../services/analytics.service.js';

const INCOMPLETE_STATUSES = new Set(['pending', 'in_progress']);

function unwrapUser(response) {
  return response?.data?.user ?? response?.data ?? null;
}

async function getAllTasks(getTasksFn) {
  const tasks = [];
  let currentPage = 1;
  let lastPage = 1;

  do {
    const response = await getTasksFn({
      page: currentPage,
      per_page: 100,
    });

    tasks.push(...(response.data ?? []));

    lastPage = response.meta?.last_page ?? currentPage;
    currentPage += 1;
  } while (currentPage <= lastPage);

  return tasks;
}

function groupIncompleteTasksByAssignee(tasks) {
  const groupedTasks = new Map();
  let unassignedTasks = 0;

  for (const task of tasks) {
    if (!INCOMPLETE_STATUSES.has(task.status)) {
      continue;
    }

    if (!task.assigned_to) {
      unassignedTasks += 1;
      continue;
    }

    const assigneeTasks = groupedTasks.get(task.assigned_to) ?? [];

    assigneeTasks.push(task);
    groupedTasks.set(task.assigned_to, assigneeTasks);
  }

  return {
    groupedTasks,
    unassignedTasks,
  };
}

function formatTaskLine(task) {
  const dueDate = task.due_date ?? 'No due date';

  return `- ${task.title} | Priority: ${task.priority} | Status: ${task.status} | Due: ${dueDate}`;
}

function buildDigestNotification(recipient, tasks, now) {
  const recipientName = recipient.name || 'Team Member';
  const pendingTasks = tasks.filter((task) => task.status === 'pending').length;
  const inProgressTasks = tasks.filter(
    (task) => task.status === 'in_progress',
  ).length;

  return {
    type: 'custom',
    recipient_email: recipient.email,
    subject: `Daily task digest — ${tasks.length} incomplete task${
      tasks.length === 1 ? '' : 's'
    }`,
    message: [
      `Hello ${recipientName},`,
      '',
      'Here is your daily incomplete-task summary:',
      '',
      `Pending: ${pendingTasks}`,
      `In progress: ${inProgressTasks}`,
      `Total incomplete: ${tasks.length}`,
      '',
      ...tasks.map(formatTaskLine),
      '',
      `Generated at: ${now.toISOString()}`,
      '',
      'Please open the Task Management Platform for more details.',
    ].join('\n'),
  };
}

export async function runDailyDigest({
  getTasksFn = getTasks,
  getUserFn = getUser,
  buildTaskSummaryFn = buildTaskSummary,
  enqueueNotificationFn = enqueueNotification,
  processQueueFn = processQueue,
  loggerInstance = logger,
  now = new Date(),
} = {}) {
  const tasks = await getAllTasks(getTasksFn);

  const summary = buildTaskSummaryFn(tasks, {
    now,
  });

  const { groupedTasks, unassignedTasks } =
    groupIncompleteTasksByAssignee(tasks);

  const result = {
    generated_at: now.toISOString(),
    total_tasks: summary.total_tasks,
    pending_tasks: summary.status.pending,
    in_progress_tasks: summary.status.in_progress,
    completed_tasks: summary.status.completed,
    cancelled_tasks: summary.status.cancelled,
    overdue_tasks: summary.overdue_tasks,
    completion_rate: summary.completion_rate,
    priority: summary.priority,

    incomplete_tasks: summary.status.pending + summary.status.in_progress,
    users_with_incomplete_tasks: groupedTasks.size,
    queued_digests: 0,
    skipped_unassigned_tasks: unassignedTasks,
    skipped_without_email: 0,
    failed_digests: 0,
  };

  for (const [assigneeId, assignedTasks] of groupedTasks.entries()) {
    try {
      const userResponse = await getUserFn(assigneeId);
      const recipient = unwrapUser(userResponse);

      if (!recipient?.email) {
        result.skipped_without_email += 1;

        loggerInstance.warn(
          {
            assigneeId,
            taskCount: assignedTasks.length,
            reason: 'missing_email',
          },
          'Daily digest skipped.',
        );

        continue;
      }

      enqueueNotificationFn(
        buildDigestNotification(recipient, assignedTasks, now),
      );

      result.queued_digests += 1;
    } catch (error) {
      result.failed_digests += 1;

      loggerInstance.error(
        {
          assigneeId,
          taskCount: assignedTasks.length,
          error: {
            name: error.name ?? 'Error',
            code: error.code ?? null,
            message: error.message ?? 'Daily digest failed.',
          },
        },
        'Failed to queue daily digest.',
      );
    }
  }

  if (result.queued_digests > 0) {
    await processQueueFn();
  }

  loggerInstance.info(
    {
      digest: result,
    },
    'Daily task digest generated.',
  );

  return result;
}
