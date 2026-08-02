import axios from 'axios';

import { env } from '../../config/env.js';
import { LaravelClientError } from '../../errors/LaravelClientError.js';

function normalizePublicLaravelError(error) {
  if (error instanceof LaravelClientError) {
    return error;
  }

  if (error.code === 'ECONNABORTED') {
    return new LaravelClientError('Laravel API request timed out.', {
      statusCode: 504,
      code: 'LARAVEL_TIMEOUT',
      cause: error,
      retryable: true,
    });
  }

  if (!error.response) {
    return new LaravelClientError('Unable to connect to the Laravel API.', {
      statusCode: 503,
      code: 'LARAVEL_UNAVAILABLE',
      cause: error,
      retryable: true,
    });
  }

  const responseData = error.response.data;

  return new LaravelClientError(
    responseData?.message || 'Laravel API request failed.',
    {
      statusCode: error.response.status,
      code: responseData?.code || 'LARAVEL_REQUEST_FAILED',
      errors: responseData?.errors,
      cause: error,
      retryable: false,
    },
  );
}

export const publicLaravelAxios = axios.create({
  baseURL: env.LARAVEL_API_URL,
  timeout: env.LARAVEL_TIMEOUT,

  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

export async function publicLaravelRequest(config) {
  try {
    const response = await publicLaravelAxios.request(config);

    return response.data;
  } catch (error) {
    throw normalizePublicLaravelError(error);
  }
}
