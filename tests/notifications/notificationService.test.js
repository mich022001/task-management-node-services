import { jest } from '@jest/globals';

const getTaskMock = jest.fn();
const getUserMock = jest.fn();
const sendMailMock = jest.fn();

jest.unstable_mockModule('../../src/clients/laravel/taskClient.js', () => ({
  getTask: getTaskMock,
}));

jest.unstable_mockModule('../../src/clients/laravel/userClient.js', () => ({
  getUser: getUserMock,
}));

jest.unstable_mockModule('../../src/services/mail.service.js', () => ({
  sendMail: sendMailMock,
}));

const { buildNotification, processNotification } =
  await import('../../src/services/notification.service.js');

describe('Notification service', () => {
  beforeEach(() => {
    getTaskMock.mockReset();
    getUserMock.mockReset();
    sendMailMock.mockReset();
  });

  test('builds a custom notification without calling Laravel', async () => {
    const notification = await buildNotification({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Maintenance notice',
      message: 'Scheduled maintenance tonight.',
    });

    expect(notification).toEqual({
      to: 'member@test.com',
      subject: 'Maintenance notice',
      text: 'Scheduled maintenance tonight.',
      html: '<p>Scheduled maintenance tonight.</p>',
    });

    expect(getTaskMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  test('builds a task assignment notification from Laravel data', async () => {
    getTaskMock.mockResolvedValue({
      data: {
        task: {
          id: 10,
          title: 'Prepare report',
          priority: 'high',
          status: 'pending',
          assigned_to: 3,
          due_date: '2026-08-10T00:00:00.000000Z',
        },
      },
    });

    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 3,
          name: 'Team Member',
          email: 'member@test.com',
        },
      },
    });

    const notification = await buildNotification({
      type: 'task_assigned',
      task_id: 10,
    });

    expect(getTaskMock).toHaveBeenCalledWith(10);
    expect(getUserMock).toHaveBeenCalledWith(3);

    expect(notification).toMatchObject({
      to: 'member@test.com',
      subject: 'New task assigned: Prepare report',
    });

    expect(notification.text).toContain('Prepare report');
    expect(notification.html).toContain('Prepare report');
  });

  test('builds a task completion notification for the creator', async () => {
    getTaskMock.mockResolvedValue({
      data: {
        task: {
          id: 11,
          title: 'Fix login bug',
          status: 'completed',
          created_by: 2,
          completed_at: '2026-08-02T05:00:00.000000Z',
        },
      },
    });

    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 2,
          name: 'Team Manager',
          email: 'manager@test.com',
        },
      },
    });

    const notification = await buildNotification({
      type: 'task_completed',
      task_id: 11,
    });

    expect(getTaskMock).toHaveBeenCalledWith(11);
    expect(getUserMock).toHaveBeenCalledWith(2);

    expect(notification).toMatchObject({
      to: 'manager@test.com',
      subject: 'Task completed: Fix login bug',
    });
  });

  test('rejects an assignment notification when task has no assignee', async () => {
    getTaskMock.mockResolvedValue({
      data: {
        task: {
          id: 12,
          title: 'Unassigned task',
          status: 'pending',
          assigned_to: null,
        },
      },
    });

    await expect(
      buildNotification({
        type: 'task_assigned',
        task_id: 12,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'TASK_ASSIGNEE_REQUIRED',
    });

    expect(getUserMock).not.toHaveBeenCalled();
  });

  test('rejects a completion notification when creator has no email', async () => {
    getTaskMock.mockResolvedValue({
      data: {
        task: {
          id: 13,
          title: 'Completed task',
          status: 'completed',
          created_by: 2,
        },
      },
    });

    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 2,
          name: 'Manager',
          email: null,
        },
      },
    });

    await expect(
      buildNotification({
        type: 'task_completed',
        task_id: 13,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'RECIPIENT_EMAIL_REQUIRED',
    });
  });

  test('processes and sends a notification', async () => {
    sendMailMock.mockResolvedValue({
      messageId: 'message-123',
    });

    const result = await processNotification({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Test',
      message: 'Test message',
    });

    expect(sendMailMock).toHaveBeenCalledWith({
      to: 'member@test.com',
      subject: 'Test',
      text: 'Test message',
      html: '<p>Test message</p>',
    });

    expect(result).toEqual({
      delivered: true,
      recipient: 'member@test.com',
      subject: 'Test',
      messageId: 'message-123',
    });
  });

  test('escapes custom notification HTML', async () => {
    const notification = await buildNotification({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Test',
      message: '<script>alert("xss")</script>',
    });

    expect(notification.html).not.toContain('<script>');
    expect(notification.html).toContain('&lt;script&gt;');
  });
});
