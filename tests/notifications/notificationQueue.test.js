import { jest } from '@jest/globals';

import { NotificationQueue } from '../../src/queues/notification.queue.js';

function createSilentLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
  };
}

describe('Notification queue', () => {
  test('adds a pending job to the queue', () => {
    const queue = new NotificationQueue({
      processor: jest.fn(),
      loggerInstance: createSilentLogger(),
    });

    const job = queue.enqueue({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Test',
      message: 'Test message',
    });

    expect(job).toMatchObject({
      type: 'custom',
      status: 'pending',
      attempts: 0,
      error: null,
    });

    expect(job.id).toEqual(expect.any(String));
    expect(queue.getQueueSize()).toBe(1);
    expect(queue.getJob(job.id)).toEqual(job);
  });

  test('processes queued jobs in FIFO order', async () => {
    const processedTypes = [];

    const queue = new NotificationQueue({
      processor: jest.fn(async (payload) => {
        processedTypes.push(payload.type);

        return {
          delivered: true,
        };
      }),
      loggerInstance: createSilentLogger(),
    });

    queue.enqueue({
      type: 'task_assigned',
      task_id: 1,
    });

    queue.enqueue({
      type: 'task_completed',
      task_id: 2,
    });

    queue.enqueue({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Test',
      message: 'Test message',
    });

    await queue.processQueue();

    expect(processedTypes).toEqual([
      'task_assigned',
      'task_completed',
      'custom',
    ]);

    expect(queue.getQueueSize()).toBe(0);
  });

  test('marks successful jobs as completed', async () => {
    const queue = new NotificationQueue({
      processor: jest.fn().mockResolvedValue({
        messageId: 'message-123',
      }),
      loggerInstance: createSilentLogger(),
    });

    const queuedJob = queue.enqueue({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Test',
      message: 'Test message',
    });

    await queue.processQueue();

    const completedJob = queue.getJob(queuedJob.id);

    expect(completedJob).toMatchObject({
      status: 'completed',
      attempts: 1,
      error: null,
      result: {
        messageId: 'message-123',
      },
    });

    expect(completedJob.started_at).not.toBeNull();
    expect(completedJob.processed_at).not.toBeNull();
  });

  test('marks failed jobs as failed', async () => {
    const queue = new NotificationQueue({
      processor: jest.fn().mockRejectedValue(
        Object.assign(new Error('SMTP failed'), {
          code: 'MAIL_DELIVERY_FAILED',
        }),
      ),
      loggerInstance: createSilentLogger(),
    });

    const queuedJob = queue.enqueue({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Test',
      message: 'Test message',
    });

    await queue.processQueue();

    expect(queue.getJob(queuedJob.id)).toMatchObject({
      status: 'failed',
      attempts: 1,
      error: {
        name: 'Error',
        code: 'MAIL_DELIVERY_FAILED',
        message: 'SMTP failed',
      },
    });
  });

  test('continues processing after one job fails', async () => {
    const processor = jest
      .fn()
      .mockRejectedValueOnce(new Error('First job failed'))
      .mockResolvedValueOnce({
        messageId: 'second-message',
      });

    const queue = new NotificationQueue({
      processor,
      loggerInstance: createSilentLogger(),
    });

    const firstJob = queue.enqueue({
      type: 'task_assigned',
      task_id: 1,
    });

    const secondJob = queue.enqueue({
      type: 'task_completed',
      task_id: 2,
    });

    await queue.processQueue();

    expect(queue.getJob(firstJob.id).status).toBe('failed');
    expect(queue.getJob(secondJob.id).status).toBe('completed');
    expect(processor).toHaveBeenCalledTimes(2);
  });

  test('does not start concurrent queue processors', async () => {
    let releaseProcessor;

    const processorBlocked = new Promise((resolve) => {
      releaseProcessor = resolve;
    });

    const processor = jest.fn(async () => {
      await processorBlocked;

      return {
        delivered: true,
      };
    });

    const queue = new NotificationQueue({
      processor,
      loggerInstance: createSilentLogger(),
    });

    queue.enqueue({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Test',
      message: 'Test message',
    });

    const firstProcessingRun = queue.processQueue();
    const secondProcessingRun = queue.processQueue();

    expect(firstProcessingRun).toBe(secondProcessingRun);
    expect(processor).toHaveBeenCalledTimes(1);

    releaseProcessor();

    await firstProcessingRun;

    expect(processor).toHaveBeenCalledTimes(1);
  });

  test('throws when processing without a configured processor', async () => {
    const queue = new NotificationQueue({
      loggerInstance: createSilentLogger(),
    });

    queue.enqueue({
      type: 'custom',
      recipient_email: 'member@test.com',
      subject: 'Test',
      message: 'Test message',
    });

    await expect(queue.processQueue()).rejects.toThrow(
      'Notification queue processor is not configured.',
    );

    expect(queue.getQueueSize()).toBe(1);
  });

  test('returns null for an unknown job', () => {
    const queue = new NotificationQueue({
      processor: jest.fn(),
      loggerInstance: createSilentLogger(),
    });

    expect(queue.getJob('missing-job')).toBeNull();
  });
});
