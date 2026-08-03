import {
  notificationSchema,
  validateNotification,
} from '../../src/validation/notification.schema.js';

describe('Notification request validation', () => {
  test('accepts a valid task assignment notification', () => {
    const result = validateNotification({
      type: 'task_assigned',
      task_id: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.success).toBe(true);
    expect(result.data.task_id).toBe('11111111-1111-4111-8111-111111111111');
  });

  test('accepts a valid task completion notification', () => {
    const result = notificationSchema.safeParse({
      type: 'task_completed',
      task_id: '22222222-2222-4222-8222-222222222222',
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
      task_id: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.success).toBe(false);
  });

  test('rejects an unsupported notification type', () => {
    const result = validateNotification({
      type: 'unknown',
      task_id: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.success).toBe(false);
  });

  test('rejects a numeric task ID because public task IDs are UUIDs', () => {
    const result = validateNotification({
      type: 'task_assigned',
      task_id: 15,
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
  it('accepts a valid task status change notification', () => {
    const result = validateNotification({
      type: 'task_status_changed',
      task_id: '123e4567-e89b-12d3-a456-426614174000',
      previous_status: 'pending',
      new_status: 'in_progress',
    });

    expect(result.success).toBe(true);
  });

  it('rejects identical previous and new task statuses', () => {
    const result = validateNotification({
      type: 'task_status_changed',
      task_id: '123e4567-e89b-12d3-a456-426614174000',
      previous_status: 'pending',
      new_status: 'pending',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unsupported previous task status', () => {
    const result = validateNotification({
      type: 'task_status_changed',
      task_id: '123e4567-e89b-12d3-a456-426614174000',
      previous_status: 'archived',
      new_status: 'completed',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unsupported new task status', () => {
    const result = validateNotification({
      type: 'task_status_changed',
      task_id: '123e4567-e89b-12d3-a456-426614174000',
      previous_status: 'pending',
      new_status: 'archived',
    });

    expect(result.success).toBe(false);
  });
});
