import { logger } from '../config/logger.js';

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);

        return;
      }

      resolve();
    });
  });
}

export function createShutdownHandler({
  server,
  stopBackgroundServices,
  loggerInstance = logger,
  exit = (code) => process.exit(code),
  setTimeoutFn = setTimeout,
  timeoutMilliseconds = 10_000,
} = {}) {
  if (!server || typeof server.close !== 'function') {
    throw new TypeError('A valid HTTP server is required.');
  }

  if (typeof stopBackgroundServices !== 'function') {
    throw new TypeError('A background-services shutdown function is required.');
  }

  let shutdownPromise = null;

  return function shutdown(signal) {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    loggerInstance.info(
      {
        signal,
      },
      'Shutdown signal received.',
    );

    const forceShutdownTimer = setTimeoutFn(() => {
      loggerInstance.error(
        {
          signal,
          timeoutMilliseconds,
        },
        'Forced shutdown after timeout.',
      );

      exit(1);
    }, timeoutMilliseconds);

    forceShutdownTimer?.unref?.();

    shutdownPromise = Promise.resolve()
      .then(async () => {
        await stopBackgroundServices();

        loggerInstance.info(
          {
            signal,
          },
          'Background services stopped during shutdown.',
        );

        await closeHttpServer(server);

        loggerInstance.info(
          {
            signal,
          },
          'HTTP server closed successfully.',
        );

        clearTimeout(forceShutdownTimer);

        exit(0);

        return true;
      })
      .catch((error) => {
        clearTimeout(forceShutdownTimer);

        loggerInstance.error(
          {
            error,
            signal,
          },
          'Application shutdown failed.',
        );

        exit(1);

        return false;
      });

    return shutdownPromise;
  };
}
