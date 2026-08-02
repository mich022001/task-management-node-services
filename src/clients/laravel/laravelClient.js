import axios from 'axios';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { LaravelClientError } from '../../errors/LaravelClientError.js';
import { retry } from '../../utils/retry.js';

function isRetryableStatus(statusCode) {
  return (
    statusCode === 408
    || statusCode === 429
    || statusCode >= 500
  );
}

function normalizeLaravelError(error) {
  if (error instanceof LaravelClientError) {
    return error;
  }

  if (error.code === 'ECONNABORTED') {
    return new LaravelClientError(
      'Laravel API request timed out.',
      {
        statusCode: 504,
        code: 'LARAVEL_TIMEOUT',
        cause: error,
        retryable: true,
      },
    );
  }

  if (!error.response) {
    return new LaravelClientError(
      'Unable to connect to the Laravel API.',
      {
        statusCode: 503,
        code: 'LARAVEL_UNAVAILABLE',
        cause: error,
        retryable: true,
      },
    );
  }

  const upstreamStatus = error.response.status;
  const responseData = error.response.data;

  return new LaravelClientError(
    responseData?.message || 'Laravel API request failed.',
    {
      statusCode: upstreamStatus,
      code:
        responseData?.code
        || 'LARAVEL_REQUEST_FAILED',
      errors: responseData?.errors,
      cause: error,
      retryable: isRetryableStatus(upstreamStatus),
    },
  );
}

export const laravelAxios = axios.create({
  baseURL: env.LARAVEL_INTERNAL_API_URL,
  timeout: env.LARAVEL_TIMEOUT,

  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Service-Key': env.LARAVEL_SERVICE_KEY,
  },
});

export async function laravelRequest(config) {
  return retry(
    async () => {
      try {
        const response = await laravelAxios.request(config);

        return response.data;
      } catch (error) {
        throw normalizeLaravelError(error);
      }
    },
    {
      retries: env.LARAVEL_RETRY_ATTEMPTS,
      delay: env.LARAVEL_RETRY_DELAY,

      shouldRetry(error) {
        return error.retryable === true;
      },

      onRetry({ attempt, retries, error }) {
        logger.warn(
          {
            attempt,
            retries,
            code: error.code,
            method: config.method,
            url: config.url,
          },
          'Retrying Laravel API request.',
        );
      },
    },
  );
}
