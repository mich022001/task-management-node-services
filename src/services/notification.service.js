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

    const userResponse = await getUser(assigneeId);
    const recipient = unwrapResource(userResponse, 'user');

    if (!recipient?.email) {
      throw new AppError('The assigned user does not have an email address.', {
        statusCode: 422,
        code: 'RECIPIENT_EMAIL_REQUIRED',
      });
    }

    return buildTaskAssignedNotification(task, recipient);
  }

  if (payload.type === 'task_completed') {
    const creatorId = task.created_by ?? task.creator?.id;

    if (!creatorId) {
      throw new AppError('The task does not have a creator.', {
        statusCode: 422,
        code: 'TASK_CREATOR_REQUIRED',
      });
    }

    const userResponse = await getUser(creatorId);
    const recipient = unwrapResource(userResponse, 'user');

    if (!recipient?.email) {
      throw new AppError('The task creator does not have an email address.', {
        statusCode: 422,
        code: 'RECIPIENT_EMAIL_REQUIRED',
      });
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
  const delivery = await sendMail(email);

  return {
    delivered: true,
    recipient: email.to,
    subject: email.subject,
    messageId: delivery.messageId,
  };
}
