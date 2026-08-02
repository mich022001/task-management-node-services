import { logger } from '../config/logger.js';

function normalizeError(error) {
  if (!error) {
    return null;
  }

  return {
    name: error.name ?? 'Error',
    code: error.code ?? null,
    message: error.message ?? 'Scheduled job failed.',
  };
}

export async function runLoggedCronJob({
  jobName,
  handler,
  loggerInstance = logger,
  now = () => Date.now(),
}) {
  if (!jobName || typeof jobName !== 'string') {
    throw new TypeError('Cron job name must be a non-empty string.');
  }

  if (typeof handler !== 'function') {
    throw new TypeError('Cron job handler must be a function.');
  }

  const startedAtMilliseconds = now();
  const startedAt = new Date(startedAtMilliseconds).toISOString();

  loggerInstance.info(
    {
      job: jobName,
      status: 'started',
      started_at: startedAt,
    },
    'Scheduled job started.',
  );

  try {
    const result = await handler();

    const finishedAtMilliseconds = now();
    const finishedAt = new Date(finishedAtMilliseconds).toISOString();
    const durationMilliseconds = Math.max(
      0,
      finishedAtMilliseconds - startedAtMilliseconds,
    );

    loggerInstance.info(
      {
        job: jobName,
        status: 'completed',
        duration_ms: durationMilliseconds,
        started_at: startedAt,
        finished_at: finishedAt,
        result: result ?? null,
      },
      'Scheduled job completed.',
    );

    return result;
  } catch (error) {
    const finishedAtMilliseconds = now();
    const finishedAt = new Date(finishedAtMilliseconds).toISOString();
    const durationMilliseconds = Math.max(
      0,
      finishedAtMilliseconds - startedAtMilliseconds,
    );

    loggerInstance.error(
      {
        job: jobName,
        status: 'failed',
        duration_ms: durationMilliseconds,
        started_at: startedAt,
        finished_at: finishedAt,
        error: normalizeError(error),
      },
      'Scheduled job failed.',
    );

    throw error;
  }
}
