import { randomUUID } from 'node:crypto';

import { logger } from '../config/logger.js';

export class NotificationQueue {
  constructor({
    processor = null,
    loggerInstance = logger,
    autoProcess = false,
  } = {}) {
    this.pendingJobIds = [];
    this.jobs = new Map();
    this.processor = processor;
    this.logger = loggerInstance;
    this.autoProcess = autoProcess;
    this.processingPromise = null;
  }

  setProcessor(processor) {
    if (typeof processor !== 'function') {
      throw new TypeError('Notification queue processor must be a function.');
    }

    this.processor = processor;
  }

  enqueue(payload) {
    const timestamp = new Date().toISOString();

    const job = {
      id: randomUUID(),
      type: payload.type,
      status: 'pending',
      payload,
      attempts: 0,
      created_at: timestamp,
      started_at: null,
      processed_at: null,
      error: null,
      result: null,
    };

    this.jobs.set(job.id, job);
    this.pendingJobIds.push(job.id);

    this.logger.info(
      {
        jobId: job.id,
        type: job.type,
        status: job.status,
      },
      'Notification queued.',
    );

    if (this.autoProcess) {
      queueMicrotask(() => {
        void this.processQueue();
      });
    }

    return this.cloneJob(job);
  }

  processQueue() {
    if (this.processingPromise) {
      return this.processingPromise;
    }

    this.processingPromise = this.drainQueue().finally(() => {
      this.processingPromise = null;
    });

    return this.processingPromise;
  }

  async drainQueue() {
    if (typeof this.processor !== 'function') {
      throw new Error('Notification queue processor is not configured.');
    }

    while (this.pendingJobIds.length > 0) {
      const jobId = this.pendingJobIds.shift();
      const job = this.jobs.get(jobId);

      if (!job) {
        continue;
      }

      job.status = 'processing';
      job.attempts += 1;
      job.started_at = new Date().toISOString();

      this.logger.info(
        {
          jobId: job.id,
          type: job.type,
          status: job.status,
          attempts: job.attempts,
        },
        'Notification processing started.',
      );

      try {
        job.result = await this.processor(job.payload, this.cloneJob(job));
        job.status = 'completed';
        job.error = null;

        this.logger.info(
          {
            jobId: job.id,
            type: job.type,
            status: job.status,
          },
          'Notification processed successfully.',
        );
      } catch (error) {
        job.status = 'failed';
        job.error = {
          name: error.name || 'Error',
          code: error.code || 'NOTIFICATION_PROCESSING_FAILED',
          message: error.message || 'Notification processing failed.',
        };

        this.logger.error(
          {
            err: error,
            jobId: job.id,
            type: job.type,
            status: job.status,
          },
          'Notification processing failed.',
        );
      } finally {
        job.processed_at = new Date().toISOString();
      }
    }
  }

  getQueueSize() {
    return this.pendingJobIds.length;
  }

  getJob(jobId) {
    const job = this.jobs.get(jobId);

    return job ? this.cloneJob(job) : null;
  }

  getJobs() {
    return Array.from(this.jobs.values(), (job) => this.cloneJob(job));
  }

  clear() {
    if (this.processingPromise) {
      throw new Error(
        'Notification queue cannot be cleared while processing jobs.',
      );
    }

    this.pendingJobIds = [];
    this.jobs.clear();
  }

  cloneJob(job) {
    return structuredClone(job);
  }
}

export const notificationQueue = new NotificationQueue();

export function configureNotificationProcessor(processor) {
  notificationQueue.setProcessor(processor);
}

export function enqueueNotification(payload) {
  return notificationQueue.enqueue(payload);
}

export function processQueue() {
  return notificationQueue.processQueue();
}

export function getQueueSize() {
  return notificationQueue.getQueueSize();
}

export function getNotificationJob(jobId) {
  return notificationQueue.getJob(jobId);
}
