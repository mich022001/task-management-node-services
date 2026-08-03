import { getTask } from '../clients/laravel/taskClient.js';
import { getUser } from '../clients/laravel/userClient.js';
import { AppError } from '../errors/AppError.js';
import { sendMail } from './mail.service.js';

function unwrapResource(response, resourceName) {
  return response?.data?.[resourceName] ?? response?.data ?? null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatStatus(status) {
  return String(status).replaceAll('_', ' ');
}

function buildSkippedNotification(recipient) {
  return {
    skipped: true,
    reason: 'EMAIL_NOTIFICATIONS_DISABLED',
    recipient: recipient?.email ?? null,
  };
}

function buildTaskAssignedNotification(task, recipient) {
  const taskTitle = task.title;
  const recipientName = recipient.name || 'Team Member';

  return {
    to: recipient.email,
    subject: `New task assigned: ${taskTitle}`,

    text: [
      `Hello ${recipientName},`,
      '',
      `A new task has been assigned to you: ${taskTitle}.`,
      `Priority: ${task.priority}`,
      `Status: ${task.status}`,
      task.due_date ? `Due date: ${task.due_date}` : null,
      '',
      'Please open the Task Management Platform for more details.',
    ]
      .filter(Boolean)
      .join('\n'),

    html: `
      <p>Hello ${escapeHtml(recipientName)},</p>
      <p>A new task has been assigned to you:</p>
      <h2>${escapeHtml(taskTitle)}</h2>
      <ul>
        <li><strong>Priority:</strong> ${escapeHtml(task.priority)}</li>
        <li><strong>Status:</strong> ${escapeHtml(task.status)}</li>
        ${
          task.due_date
            ? `<li><strong>Due date:</strong> ${escapeHtml(task.due_date)}</li>`
            : ''
        }
      </ul>
      <p>Please open the Task Management Platform for more details.</p>
    `.trim(),
  };
}

function buildTaskStatusChangedNotification(task, recipient, payload) {
  const taskTitle = task.title;
  const recipientName = recipient.name || 'Manager';

  const previousStatus = formatStatus(payload.previous_status);
  const newStatus = formatStatus(payload.new_status);

  return {
    to: recipient.email,
    subject: `Task status changed: ${taskTitle}`,

    text: [
      `Hello ${recipientName},`,
      '',
      `The status of "${taskTitle}" changed.`,
      `Previous status: ${previousStatus}`,
      `New status: ${newStatus}`,
      '',
      'Please open the Task Management Platform for more details.',
    ].join('\n'),

    html: `
      <p>Hello ${escapeHtml(recipientName)},</p>
      <p>The status of the following task changed:</p>
      <h2>${escapeHtml(taskTitle)}</h2>
      <ul>
        <li>
          <strong>Previous status:</strong>
          ${escapeHtml(previousStatus)}
        </li>
        <li>
          <strong>New status:</strong>
          ${escapeHtml(newStatus)}
        </li>
      </ul>
      <p>Please open the Task Management Platform for more details.</p>
    `.trim(),
  };
}

function buildTaskCompletedNotification(task, recipient) {
  const taskTitle = task.title;
  const recipientName = recipient.name || 'Manager';

  return {
    to: recipient.email,
    subject: `Task completed: ${taskTitle}`,

    text: [
      `Hello ${recipientName},`,
      '',
      `The task "${taskTitle}" has been completed.`,
      `Status: ${task.status}`,
      task.completed_at ? `Completed at: ${task.completed_at}` : null,
    ]
      .filter(Boolean)
      .join('\n'),

    html: `
      <p>Hello ${escapeHtml(recipientName)},</p>
      <p>The following task has been completed:</p>
      <h2>${escapeHtml(taskTitle)}</h2>
      <ul>
        <li><strong>Status:</strong> ${escapeHtml(task.status)}</li>
        ${
          task.completed_at
            ? `<li><strong>Completed at:</strong> ${escapeHtml(
                task.completed_at,
              )}</li>`
            : ''
        }
      </ul>
    `.trim(),
  };
}

function buildCustomNotification(payload) {
  const safeMessage = escapeHtml(payload.message).replaceAll('\n', '<br>');

  return {
    to: payload.recipient_email,
    subject: payload.subject,
    text: payload.message,
    html: `<p>${safeMessage}</p>`,
  };
}

async function getRecipient(userId, roleDescription) {
  const userResponse = await getUser(userId);
  const recipient = unwrapResource(userResponse, 'user');

  if (recipient?.email_notifications_enabled === false) {
    return buildSkippedNotification(recipient);
  }

  if (!recipient?.email) {
    throw new AppError(
      `The ${roleDescription} does not have an email address.`,
      {
        statusCode: 422,
        code: 'RECIPIENT_EMAIL_REQUIRED',
      },
    );
  }

  return recipient;
}

export async function buildNotification(payload) {
  if (payload.type === 'custom') {
    return buildCustomNotification(payload);
  }

  const taskResponse = await getTask(payload.task_id);
  const task = unwrapResource(taskResponse, 'task');

  if (!task) {
    throw new AppError('Task data was not returned by Laravel.', {
      statusCode: 502,
      code: 'INVALID_LARAVEL_TASK_RESPONSE',
    });
  }

  if (payload.type === 'task_assigned') {
    const assigneeId = task.assigned_to ?? task.assignee?.id;

    if (!assigneeId) {
      throw new AppError('The task does not have an assigned user.', {
        statusCode: 422,
        code: 'TASK_ASSIGNEE_REQUIRED',
      });
    }

    const recipient = await getRecipient(assigneeId, 'assigned user');

    if (recipient.skipped) {
      return recipient;
    }

    return buildTaskAssignedNotification(task, recipient);
  }

  if (payload.type === 'task_status_changed') {
    const creatorId = task.created_by ?? task.creator?.id;

    if (!creatorId) {
      throw new AppError('The task does not have a creator.', {
        statusCode: 422,
        code: 'TASK_CREATOR_REQUIRED',
      });
    }

    const recipient = await getRecipient(creatorId, 'task creator');

    if (recipient.skipped) {
      return recipient;
    }

    return buildTaskStatusChangedNotification(task, recipient, payload);
  }

  if (payload.type === 'task_completed') {
    const creatorId = task.created_by ?? task.creator?.id;

    if (!creatorId) {
      throw new AppError('The task does not have a creator.', {
        statusCode: 422,
        code: 'TASK_CREATOR_REQUIRED',
      });
    }

    const recipient = await getRecipient(creatorId, 'task creator');

    if (recipient.skipped) {
      return recipient;
    }

    return buildTaskCompletedNotification(task, recipient);
  }

  throw new AppError('Unsupported notification type.', {
    statusCode: 422,
    code: 'UNSUPPORTED_NOTIFICATION_TYPE',
  });
}

export async function processNotification(payload) {
  const email = await buildNotification(payload);

  if (email.skipped) {
    return {
      delivered: false,
      skipped: true,
      reason: email.reason,
      recipient: email.recipient,
    };
  }

  const delivery = await sendMail(email);

  return {
    delivered: true,
    skipped: false,
    recipient: email.to,
    subject: email.subject,
    messageId: delivery.messageId,
  };
}
