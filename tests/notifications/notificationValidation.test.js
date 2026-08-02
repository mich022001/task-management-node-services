import {
  notificationSchema,
  validateNotification,
} from '../../src/validation/notification.schema.js';

describe('Notification request validation', () => {
  test('accepts a valid task assignment notification', () => {
    const result = validateNotification({
      type: 'task_assigned',
      task_id: 1,
    });

    expect(result.success).toBe(true);
    expect(result.data.task_id).toBe(1);
  });

  test('accepts a valid task completion notification', () => {
    const result = notificationSchema.safeParse({
      type: 'task_completed',
      task_id: 2,
    });

    expect(result.success).toBe(true);
  });

  test('accepts a valid custom notification', () => {
    const result = validateNotification({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Maintenance notice',
      message: 'The platform will be unavailable tonight.',
    });

    expect(result.success).toBe(true);
  });

  test('rejects a missing notification type', () => {
    const result = validateNotification({
      task_id: 1,
    });

    expect(result.success).toBe(false);
  });

  test('rejects an unsupported notification type', () => {
    const result = validateNotification({
      type: 'unknown',
      task_id: 1,
    });

    expect(result.success).toBe(false);
  });

  test('rejects missing task id for task notifications', () => {
    const result = validateNotification({
      type: 'task_assigned',
    });

    expect(result.success).toBe(false);
  });

  test('rejects invalid recipient email for custom notifications', () => {
    const result = validateNotification({
      type: 'custom',
      recipient_email: 'invalid-email',
      subject: 'Test',
      message: 'Test message',
    });

    expect(result.success).toBe(false);
  });

  test('rejects missing custom subject', () => {
    const result = validateNotification({
      type: 'custom',
      recipient_email: 'member@test.com',
      message: 'Test message',
    });

    expect(result.success).toBe(false);
  });

  test('rejects missing custom message', () => {
    const result = validateNotification({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Test',
    });

    expect(result.success).toBe(false);
  });
});
