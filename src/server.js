import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import {
  startBackgroundServices,
  stopBackgroundServices,
} from './runtime/backgroundServices.js';
import { createShutdownHandler } from './runtime/shutdown.js';

const server = app.listen(env.PORT, () => {
  try {
    startBackgroundServices();

    logger.info(
      {
        port: env.PORT,
        environment: env.NODE_ENV,
      },
      `Node.js service running at http://localhost:${env.PORT}`,
    );
  } catch (error) {
    logger.fatal(
      {
        error,
      },
      'Failed to start background services.',
    );

    server.close(() => {
      process.exit(1);
    });
  }
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

const shutdown = createShutdownHandler({
  server,
  stopBackgroundServices,
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('uncaughtException', (error) => {
  logger.fatal(
    {
      error,
    },
    'Uncaught exception.',
  );

  void shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal(
    {
      reason,
    },
    'Unhandled promise rejection.',
  );

  void shutdown('unhandledRejection');
});
