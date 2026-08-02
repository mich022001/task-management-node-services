import { jest } from '@jest/globals';
import request from 'supertest';

const enqueueNotificationMock = jest.fn();
const processQueueMock = jest.fn();

jest.unstable_mockModule('../../src/queues/notification.queue.js', () => ({
  configureNotificationProcessor: jest.fn(),
  enqueueNotification: enqueueNotificationMock,
  processQueue: processQueueMock,
}));

const { default: app } = await import('../../src/app.js');
const { createToken } = await import('../helpers/jwt.js');

describe('Notification route', () => {
  beforeEach(() => {
    enqueueNotificationMock.mockReset();
    processQueueMock.mockReset();

    enqueueNotificationMock.mockReturnValue({
      id: 'notification-job-123',
      type: 'custom',
      status: 'pending',
      created_at: '2026-08-02T09:00:00.000Z',
    });

    processQueueMock.mockResolvedValue();
  });

  test('rejects a request without authentication', async () => {
    const response = await request(app).post('/api/v1/notifications').send({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Test',
      message: 'Test message',
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });

    expect(enqueueNotificationMock).not.toHaveBeenCalled();
  });

  test('rejects a team member', async () => {
    const token = createToken({
      sub: '3',
      email: 'member@test.com',
      role: 'team_member',
    });

    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'custom',
        recipient_email: 'member@test.com',
        subject: 'Test',
        message: 'Test message',
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
    });

    expect(enqueueNotificationMock).not.toHaveBeenCalled();
  });

  test('rejects an invalid notification payload', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'custom',
        recipient_email: 'invalid-email',
      });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      message: 'Notification request validation failed.',
      code: 'VALIDATION_FAILED',
    });

    expect(response.body.errors).toEqual(
      expect.objectContaining({
        recipient_email: expect.any(Array),
        subject: expect.any(Array),
        message: expect.any(Array),
      }),
    );

    expect(enqueueNotificationMock).not.toHaveBeenCalled();
    expect(processQueueMock).not.toHaveBeenCalled();
  });

  test('allows an admin to queue a custom notification', async () => {
    const token = createToken({
      sub: '1',
      role: 'admin',
    });

    const payload = {
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Maintenance notice',
      message: 'Scheduled maintenance tonight.',
    };

    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: 'Notification queued successfully.',
      data: {
        job: {
          id: 'notification-job-123',
          type: 'custom',
          status: 'pending',
          created_at: '2026-08-02T09:00:00.000Z',
        },
      },
    });

    expect(enqueueNotificationMock).toHaveBeenCalledWith(payload);
    expect(processQueueMock).toHaveBeenCalledTimes(1);
  });

  test('allows a manager to queue a task notification', async () => {
    const token = createToken({
      sub: '2',
      email: 'manager@test.com',
      role: 'manager',
    });

    const payload = {
      type: 'task_assigned',
      task_id: 15,
    };

    enqueueNotificationMock.mockReturnValue({
      id: 'notification-job-456',
      type: 'task_assigned',
      status: 'pending',
      created_at: '2026-08-02T09:10:00.000Z',
    });

    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      message: 'Notification queued successfully.',
      data: {
        job: {
          id: 'notification-job-456',
          type: 'task_assigned',
          status: 'pending',
        },
      },
    });

    expect(enqueueNotificationMock).toHaveBeenCalledWith(payload);
    expect(processQueueMock).toHaveBeenCalledTimes(1);
  });

  test('returns the queue job identifier', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'custom',
        recipient_email: 'manager@test.com',
        subject: 'Test notification',
        message: 'This is a test.',
      });

    expect(response.status).toBe(202);
    expect(response.body.data.job.id).toBe('notification-job-123');
  });

  test('queues the normalized validation result', async () => {
    const token = createToken({
      role: 'manager',
    });

    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'task_completed',
        task_id: '25',
      });

    expect(response.status).toBe(202);

    expect(enqueueNotificationMock).toHaveBeenCalledWith({
      type: 'task_completed',
      task_id: 25,
    });
  });
});
