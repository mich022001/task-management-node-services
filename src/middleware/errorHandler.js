import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export function errorHandler(error, req, res, _next) {
  const parsedStatusCode = Number(error.statusCode || error.status || 500);

  const statusCode =
    Number.isInteger(parsedStatusCode) &&
    parsedStatusCode >= 400 &&
    parsedStatusCode <= 599
      ? parsedStatusCode
      : 500;

  const isServerError = statusCode >= 500;
  const requestLogger = req.log || logger;

  requestLogger[isServerError ? 'error' : 'warn'](
    {
      err: error,
      method: req.method,
      path: req.originalUrl,
      statusCode,
    },
    error.message || 'Request failed.',
  );

  const response = {
    message:
      isServerError && env.NODE_ENV === 'production'
        ? 'Internal server error.'
        : error.message || 'Internal server error.',
    code:
      error.code ||
      (isServerError ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
  };

  if (error.errors !== undefined) {
    response.errors = error.errors;
  }

  if (env.NODE_ENV === 'development' && error.stack) {
    response.stack = error.stack;
  }

  return res.status(statusCode).json(response);
}
