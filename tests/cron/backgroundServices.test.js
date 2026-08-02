import { jest } from '@jest/globals';

import { BackgroundServices } from '../../src/runtime/backgroundServices.js';

function createLogger() {
  return {
    info: jest.fn(),
  };
}

function createDependencies() {
  const scheduler = {
    start: jest.fn(() => true),
    stop: jest.fn().mockResolvedValue(true),
  };

  return {
    scheduler,
    registerCronJobsFn: jest.fn(),
    configureNotificationProcessorFn: jest.fn(),
    notificationProcessor: jest.fn(),
    startAcceptingNotificationJobsFn: jest.fn(),
    stopAcceptingNotificationJobsFn: jest.fn(),
    waitForNotificationQueueIdleFn: jest.fn().mockResolvedValue(),
    loggerInstance: createLogger(),
  };
}

describe('Background services lifecycle', () => {
  test('configures the notification processor on startup', () => {
    const dependencies = createDependencies();

    const services = new BackgroundServices(dependencies);

    expect(services.start()).toBe(true);

    expect(dependencies.configureNotificationProcessorFn).toHaveBeenCalledWith(
      dependencies.notificationProcessor,
    );
  });

  test('registers and starts scheduled jobs', () => {
    const dependencies = createDependencies();

    const services = new BackgroundServices(dependencies);

    services.start();

    expect(dependencies.registerCronJobsFn).toHaveBeenCalledWith({
      scheduler: dependencies.scheduler,
    });

    expect(dependencies.scheduler.start).toHaveBeenCalledTimes(1);
  });

  test('starts accepting notification jobs', () => {
    const dependencies = createDependencies();

    const services = new BackgroundServices(dependencies);

    services.start();

    expect(dependencies.startAcceptingNotificationJobsFn).toHaveBeenCalledTimes(
      1,
    );
  });

  test('prevents duplicate startup', () => {
    const dependencies = createDependencies();

    const services = new BackgroundServices(dependencies);

    expect(services.start()).toBe(true);
    expect(services.start()).toBe(false);

    expect(dependencies.configureNotificationProcessorFn).toHaveBeenCalledTimes(
      1,
    );

    expect(dependencies.registerCronJobsFn).toHaveBeenCalledTimes(1);

    expect(dependencies.scheduler.start).toHaveBeenCalledTimes(1);
  });

  test('does not register cron jobs again after restart', async () => {
    const dependencies = createDependencies();

    const services = new BackgroundServices(dependencies);

    services.start();
    await services.stop();
    services.start();

    expect(dependencies.registerCronJobsFn).toHaveBeenCalledTimes(1);

    expect(dependencies.scheduler.start).toHaveBeenCalledTimes(2);
  });

  test('stops accepting notification jobs before shutdown', async () => {
    const dependencies = createDependencies();

    const callOrder = [];

    dependencies.stopAcceptingNotificationJobsFn.mockImplementation(() => {
      callOrder.push('stop-accepting');
    });

    dependencies.scheduler.stop.mockImplementation(async () => {
      callOrder.push('stop-scheduler');
    });

    dependencies.waitForNotificationQueueIdleFn.mockImplementation(async () => {
      callOrder.push('wait-for-queue');
    });

    const services = new BackgroundServices(dependencies);

    services.start();
    await services.stop();

    expect(callOrder).toEqual([
      'stop-accepting',
      'stop-scheduler',
      'wait-for-queue',
    ]);
  });

  test('waits for the scheduler and notification queue', async () => {
    const dependencies = createDependencies();

    const services = new BackgroundServices(dependencies);

    services.start();

    expect(await services.stop()).toBe(true);

    expect(dependencies.scheduler.stop).toHaveBeenCalledTimes(1);

    expect(dependencies.waitForNotificationQueueIdleFn).toHaveBeenCalledTimes(
      1,
    );

    expect(services.isStarted()).toBe(false);
  });

  test('prevents duplicate concurrent shutdown', async () => {
    const dependencies = createDependencies();

    let resolveShutdown;

    dependencies.scheduler.stop.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveShutdown = resolve;
        }),
    );

    const services = new BackgroundServices(dependencies);

    services.start();

    const firstStop = services.stop();
    const secondStop = services.stop();

    expect(firstStop).toBe(secondStop);

    resolveShutdown(true);

    await firstStop;

    expect(dependencies.scheduler.stop).toHaveBeenCalledTimes(1);
  });

  test('returns false when services are already stopped', async () => {
    const dependencies = createDependencies();

    const services = new BackgroundServices(dependencies);

    await expect(services.stop()).resolves.toBe(false);

    expect(dependencies.scheduler.stop).not.toHaveBeenCalled();
  });

  test('logs startup and shutdown completion', async () => {
    const dependencies = createDependencies();

    const services = new BackgroundServices(dependencies);

    services.start();
    await services.stop();

    expect(dependencies.loggerInstance.info).toHaveBeenNthCalledWith(
      1,
      {
        schedulerStarted: true,
        notificationQueueAcceptingJobs: true,
      },
      'Background services started.',
    );

    expect(dependencies.loggerInstance.info).toHaveBeenNthCalledWith(
      2,
      {
        schedulerStarted: false,
        notificationQueueAcceptingJobs: false,
      },
      'Background services stopped.',
    );
  });
});
