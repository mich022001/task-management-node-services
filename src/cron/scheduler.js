import cron from 'node-cron';

import { logger } from '../config/logger.js';

export const CRON_SCHEDULES = Object.freeze({
  dailyDigest: '0 8 * * *',
  deadlineReminder: '0 */2 * * *',
  cleanup: '0 0 * * *',
});

export class CronScheduler {
  constructor({
    cronInstance = cron,
    loggerInstance = logger,
    timezone = 'Asia/Manila',
  } = {}) {
    this.cron = cronInstance;
    this.logger = loggerInstance;
    this.timezone = timezone;
    this.jobs = new Map();
    this.started = false;
  }

  registerJob({ name, schedule, handler }) {
    if (this.started) {
      throw new Error(
        'Cron jobs cannot be registered after the scheduler has started.',
      );
    }

    if (!name || typeof name !== 'string') {
      throw new TypeError('Cron job name must be a non-empty string.');
    }

    if (!schedule || typeof schedule !== 'string') {
      throw new TypeError('Cron schedule must be a non-empty string.');
    }

    if (!this.cron.validate(schedule)) {
      throw new TypeError(`Invalid cron schedule for job: ${name}`);
    }

    if (typeof handler !== 'function') {
      throw new TypeError('Cron job handler must be a function.');
    }

    if (this.jobs.has(name)) {
      throw new Error(`Cron job is already registered: ${name}`);
    }

    this.jobs.set(name, {
      name,
      schedule,
      handler,
      task: null,
      runningPromise: null,
    });

    return this;
  }

  start() {
    if (this.started) {
      return false;
    }

    for (const job of this.jobs.values()) {
      job.task = this.cron.schedule(
        job.schedule,
        () => {
          if (job.runningPromise) {
            this.logger.warn(
              {
                job: job.name,
                status: 'skipped',
                reason: 'already_running',
              },
              'Scheduled job execution skipped.',
            );

            return;
          }

          job.runningPromise = Promise.resolve()
            .then(() => job.handler())
            .catch((error) => {
              this.logger.error(
                {
                  job: job.name,
                  error,
                },
                'Scheduled job execution rejected.',
              );
            })
            .finally(() => {
              job.runningPromise = null;
            });
        },
        {
          scheduled: false,
          timezone: this.timezone,
        },
      );

      job.task.start();
    }

    this.started = true;

    this.logger.info(
      {
        jobs: Array.from(this.jobs.keys()),
        timezone: this.timezone,
      },
      'Cron scheduler started.',
    );

    return true;
  }

  async stop() {
    if (!this.started) {
      return false;
    }

    for (const job of this.jobs.values()) {
      job.task?.stop();
    }

    const runningJobs = Array.from(
      this.jobs.values(),
      (job) => job.runningPromise,
    ).filter(Boolean);

    await Promise.allSettled(runningJobs);

    for (const job of this.jobs.values()) {
      job.task?.destroy?.();
      job.task = null;
      job.runningPromise = null;
    }

    this.started = false;

    this.logger.info(
      {
        jobs: Array.from(this.jobs.keys()),
      },
      'Cron scheduler stopped.',
    );

    return true;
  }

  isStarted() {
    return this.started;
  }

  getRegisteredJobs() {
    return Array.from(this.jobs.values(), (job) => ({
      name: job.name,
      schedule: job.schedule,
      running: job.runningPromise !== null,
    }));
  }
}

export const cronScheduler = new CronScheduler();

export function startScheduler() {
  return cronScheduler.start();
}

export function stopScheduler() {
  return cronScheduler.stop();
}
