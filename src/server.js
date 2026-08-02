import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      environment: env.NODE_ENV,
    },
    `Node.js service running at http://localhost:${env.PORT}`,
  );
});

server.on('error', (error) => {
  logger.fatal(
    {
      error,
    },
    'HTTP server failed to start.',
  );

  process.exit(1);
});

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  logger.info(
    {
      signal,
    },
    'Shutdown signal received. Closing HTTP server.',
  );

  server.close((error) => {
    if (error) {
      logger.error(
        {
          error,
        },
        'Failed to close HTTP server cleanly.',
      );

      process.exit(1);
    }

    logger.info('HTTP server closed successfully.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.fatal(
    {
      error,
    },
    'Uncaught exception.',
  );

  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal(
    {
      reason,
    },
    'Unhandled promise rejection.',
  );

  shutdown('unhandledRejection');
});
