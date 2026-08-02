import { AppError } from './AppError.js';

export class LaravelClientError extends AppError {
  constructor(
    message,
    {
      statusCode = 502,
      code = 'LARAVEL_CLIENT_ERROR',
      errors,
      cause,
      retryable = false,
    } = {},
  ) {
    super(message, {
      statusCode,
      code,
      errors,
      cause,
    });

    this.name = 'LaravelClientError';
    this.retryable = retryable;

    Error.captureStackTrace?.(this, LaravelClientError);
  }
}
