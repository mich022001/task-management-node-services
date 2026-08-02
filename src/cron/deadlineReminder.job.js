import { getTasks } from '../clients/laravel/taskClient.js';
import { getUser } from '../clients/laravel/userClient.js';
import { logger } from '../config/logger.js';
import {
  enqueueNotification,
  processQueue,
} from '../queues/notification.queue.js';
import { buildUpcomingDeadlines } from '../services/analytics.service.js';

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

function buildReminderKey(task) {
  return `${task.id}:${task.due_date}`;
}

function buildReminderMessage(task, recipient) {
  const recipientName = recipient.name || 'Team Member';

  return {
    type: 'custom',
    recipient_email: recipient.email,
    subject: `Task deadline reminder: ${task.title}`,
    message: [
      `Hello ${recipientName},`,
      '',
      `This is a reminder that the task "${task.title}" is approaching its deadline.`,
      `Priority: ${task.priority}`,
      `Status: ${task.status}`,
      `Due date: ${task.due_date}`,
      '',
      'Please open the Task Management Platform for more details.',
    ].join('\n'),
  };
}

export class DeadlineReminderRegistry {
  constructor() {
    this.entries = new Map();
  }

  has(key) {
    return this.entries.has(key);
  }

  add(key, remindedAt = new Date()) {
    this.entries.set(key, remindedAt.toISOString());
  }

  delete(key) {
    return this.entries.delete(key);
  }

  clear() {
    const removedEntries = this.entries.size;

    this.entries.clear();

    return removedEntries;
  }

  size() {
    return this.entries.size;
  }

  removeOlderThan(cutoff) {
    const cutoffTime =
      cutoff instanceof Date ? cutoff.getTime() : new Date(cutoff).getTime();

    if (Number.isNaN(cutoffTime)) {
      throw new TypeError('Reminder cleanup cutoff must be a valid date.');
    }

    let removedEntries = 0;

    for (const [key, remindedAt] of this.entries.entries()) {
      const remindedTime = new Date(remindedAt).getTime();

      if (!Number.isNaN(remindedTime) && remindedTime <= cutoffTime) {
        this.entries.delete(key);
        removedEntries += 1;
      }
    }

    return removedEntries;
  }
}

export const deadlineReminderRegistry = new DeadlineReminderRegistry();

export async function runDeadlineReminder({
  getTasksFn = getTasks,
  getUserFn = getUser,
  buildUpcomingDeadlinesFn = buildUpcomingDeadlines,
  enqueueNotificationFn = enqueueNotification,
  processQueueFn = processQueue,
  reminderRegistry = deadlineReminderRegistry,
  loggerInstance = logger,
  now = new Date(),
  days = 1,
} = {}) {
  const tasks = await getAllTasks(getTasksFn);

  const deadlines = buildUpcomingDeadlinesFn(tasks, {
    days,
    now,
  });

  const result = {
    checked_tasks: tasks.length,
    upcoming_tasks: deadlines.upcoming.length,
    queued_reminders: 0,
    skipped_duplicates: 0,
    skipped_without_assignee: 0,
    skipped_without_email: 0,
    failed_reminders: 0,
  };

  for (const task of deadlines.upcoming) {
    const reminderKey = buildReminderKey(task);

    if (reminderRegistry.has(reminderKey)) {
      result.skipped_duplicates += 1;

      continue;
    }

    if (!task.assigned_to) {
      result.skipped_without_assignee += 1;

      loggerInstance.warn(
        {
          taskId: task.id,
          title: task.title,
          reason: 'missing_assignee',
        },
        'Deadline reminder skipped.',
      );

      continue;
    }

    try {
      const userResponse = await getUserFn(task.assigned_to);
      const recipient = unwrapUser(userResponse);

      if (!recipient?.email) {
        result.skipped_without_email += 1;

        loggerInstance.warn(
          {
            taskId: task.id,
            assignedTo: task.assigned_to,
            reason: 'missing_email',
          },
          'Deadline reminder skipped.',
        );

        continue;
      }

      const notification = buildReminderMessage(task, recipient);

      enqueueNotificationFn(notification);
      reminderRegistry.add(reminderKey, now);

      result.queued_reminders += 1;
    } catch (error) {
      result.failed_reminders += 1;

      loggerInstance.error(
        {
          error: {
            name: error.name ?? 'Error',
            code: error.code ?? null,
            message: error.message ?? 'Deadline reminder failed.',
          },
          taskId: task.id,
          assignedTo: task.assigned_to,
        },
        'Failed to queue deadline reminder.',
      );
    }
  }

  if (result.queued_reminders > 0) {
    await processQueueFn();
  }

  loggerInstance.info(
    {
      reminder: result,
      range_days: days,
      generated_at: now.toISOString(),
    },
    'Deadline reminder job completed.',
  );

  return result;
}
