import { jest } from '@jest/globals';

import { createShutdownHandler } from '../../src/runtime/shutdown.js';

function createLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
  };
}

function createServer({ closeError = null } = {}) {
  return {
    close: jest.fn((callback) => {
      callback(closeError);
    }),
  };
}

describe('Application shutdown coordinator', () => {
  test('stops background services before closing HTTP server', async () => {
    const callOrder = [];

    const server = {
      close: jest.fn((callback) => {
        callOrder.push('http-server');

        callback();
      }),
    };

    const stopBackgroundServices = jest.fn(async () => {
      callOrder.push('background-services');
    });

    const exit = jest.fn();

    const shutdown = createShutdownHandler({
      server,
      stopBackgroundServices,
      loggerInstance: createLogger(),
      exit,
    });

    await shutdown('SIGTERM');

    expect(callOrder).toEqual(['background-services', 'http-server']);

    expect(exit).toHaveBeenCalledWith(0);
  });

  test('handles SIGINT shutdown successfully', async () => {
    const server = createServer();
    const stopBackgroundServices = jest.fn().mockResolvedValue(true);
    const exit = jest.fn();

    const shutdown = createShutdownHandler({
      server,
      stopBackgroundServices,
      loggerInstance: createLogger(),
      exit,
    });

    await expect(shutdown('SIGINT')).resolves.toBe(true);

    expect(stopBackgroundServices).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('prevents duplicate concurrent shutdown', async () => {
    let finishBackgroundShutdown;

    const backgroundShutdownGate = new Promise((resolve) => {
      finishBackgroundShutdown = resolve;
    });

    const stopBackgroundServices = jest.fn(() => backgroundShutdownGate);

    const shutdown = createShutdownHandler({
      server: createServer(),
      stopBackgroundServices,
      loggerInstance: createLogger(),
      exit: jest.fn(),
    });

    const firstShutdown = shutdown('SIGTERM');
    const secondShutdown = shutdown('SIGINT');

    expect(firstShutdown).toBe(secondShutdown);

    finishBackgroundShutdown(true);

    await firstShutdown;

    expect(stopBackgroundServices).toHaveBeenCalledTimes(1);
  });

  test('exits with failure when background shutdown fails', async () => {
    const error = new Error('Background services failed to stop.');

    const loggerInstance = createLogger();
    const exit = jest.fn();

    const shutdown = createShutdownHandler({
      server: createServer(),
      stopBackgroundServices: jest.fn().mockRejectedValue(error),
      loggerInstance,
      exit,
    });

    await expect(shutdown('SIGTERM')).resolves.toBe(false);

    expect(exit).toHaveBeenCalledWith(1);

    expect(loggerInstance.error).toHaveBeenCalledWith(
      {
        error,
        signal: 'SIGTERM',
      },
      'Application shutdown failed.',
    );
  });

  test('exits with failure when HTTP server close fails', async () => {
    const error = new Error('HTTP close failed.');
    const exit = jest.fn();

    const shutdown = createShutdownHandler({
      server: createServer({
        closeError: error,
      }),
      stopBackgroundServices: jest.fn().mockResolvedValue(true),
      loggerInstance: createLogger(),
      exit,
    });

    await expect(shutdown('SIGINT')).resolves.toBe(false);

    expect(exit).toHaveBeenCalledWith(1);
  });

  test('logs shutdown lifecycle events', async () => {
    const loggerInstance = createLogger();

    const shutdown = createShutdownHandler({
      server: createServer(),
      stopBackgroundServices: jest.fn().mockResolvedValue(true),
      loggerInstance,
      exit: jest.fn(),
    });

    await shutdown('SIGTERM');

    expect(loggerInstance.info).toHaveBeenNthCalledWith(
      1,
      {
        signal: 'SIGTERM',
      },
      'Shutdown signal received.',
    );

    expect(loggerInstance.info).toHaveBeenNthCalledWith(
      2,
      {
        signal: 'SIGTERM',
      },
      'Background services stopped during shutdown.',
    );

    expect(loggerInstance.info).toHaveBeenNthCalledWith(
      3,
      {
        signal: 'SIGTERM',
      },
      'HTTP server closed successfully.',
    );
  });

  test('forces shutdown after the configured timeout', () => {
    const loggerInstance = createLogger();
    const exit = jest.fn();
    let timeoutCallback;

    const setTimeoutFn = jest.fn((callback) => {
      timeoutCallback = callback;

      return {
        unref: jest.fn(),
      };
    });

    const shutdown = createShutdownHandler({
      server: {
        close: jest.fn(),
      },
      stopBackgroundServices: jest.fn(() => new Promise(() => {})),
      loggerInstance,
      exit,
      setTimeoutFn,
      timeoutMilliseconds: 5000,
    });

    void shutdown('SIGTERM');

    timeoutCallback();

    expect(exit).toHaveBeenCalledWith(1);

    expect(loggerInstance.error).toHaveBeenCalledWith(
      {
        signal: 'SIGTERM',
        timeoutMilliseconds: 5000,
      },
      'Forced shutdown after timeout.',
    );
  });

  test('rejects a missing HTTP server', () => {
    expect(() =>
      createShutdownHandler({
        stopBackgroundServices: jest.fn(),
      }),
    ).toThrow('A valid HTTP server is required.');
  });

  test('rejects a missing background shutdown function', () => {
    expect(() =>
      createShutdownHandler({
        server: createServer(),
      }),
    ).toThrow('A background-services shutdown function is required.');
  });
});
