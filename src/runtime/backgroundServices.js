import { logger } from '../config/logger.js';
import { registerCronJobs } from '../cron/registerJobs.js';
import { cronScheduler } from '../cron/scheduler.js';
import {
  configureNotificationProcessor,
  startAcceptingNotificationJobs,
  stopAcceptingNotificationJobs,
  waitForNotificationQueueIdle,
} from '../queues/notification.queue.js';
import { processNotification } from '../services/notification.service.js';

export class BackgroundServices {
  constructor({
    scheduler = cronScheduler,
    registerCronJobsFn = registerCronJobs,
    configureNotificationProcessorFn = configureNotificationProcessor,
    notificationProcessor = processNotification,
    startAcceptingNotificationJobsFn = startAcceptingNotificationJobs,
    stopAcceptingNotificationJobsFn = stopAcceptingNotificationJobs,
    waitForNotificationQueueIdleFn = waitForNotificationQueueIdle,
    loggerInstance = logger,
  } = {}) {
    this.scheduler = scheduler;
    this.registerCronJobs = registerCronJobsFn;
    this.configureNotificationProcessor = configureNotificationProcessorFn;
    this.notificationProcessor = notificationProcessor;
    this.startAcceptingNotificationJobs = startAcceptingNotificationJobsFn;
    this.stopAcceptingNotificationJobs = stopAcceptingNotificationJobsFn;
    this.waitForNotificationQueueIdle = waitForNotificationQueueIdleFn;
    this.logger = loggerInstance;

    this.jobsRegistered = false;
    this.started = false;
    this.stoppingPromise = null;
  }

  start() {
    if (this.started) {
      return false;
    }

    this.configureNotificationProcessor(this.notificationProcessor);

    this.startAcceptingNotificationJobs();

    if (!this.jobsRegistered) {
      this.registerCronJobs({
        scheduler: this.scheduler,
      });

      this.jobsRegistered = true;
    }

    this.scheduler.start();
    this.started = true;

    this.logger.info(
      {
        schedulerStarted: true,
        notificationQueueAcceptingJobs: true,
      },
      'Background services started.',
    );

    return true;
  }

  stop() {
    if (this.stoppingPromise) {
      return this.stoppingPromise;
    }

    if (!this.started) {
      return Promise.resolve(false);
    }

    this.stoppingPromise = this.performStop().finally(() => {
      this.stoppingPromise = null;
    });

    return this.stoppingPromise;
  }

  async performStop() {
    this.stopAcceptingNotificationJobs();

    await this.scheduler.stop();
    await this.waitForNotificationQueueIdle();

    this.started = false;

    this.logger.info(
      {
        schedulerStarted: false,
        notificationQueueAcceptingJobs: false,
      },
      'Background services stopped.',
    );

    return true;
  }

  isStarted() {
    return this.started;
  }
}

export const backgroundServices = new BackgroundServices();

export function startBackgroundServices() {
  return backgroundServices.start();
}

export function stopBackgroundServices() {
  return backgroundServices.stop();
}
