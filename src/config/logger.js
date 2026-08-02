import pino from 'pino';
import pinoHttp from 'pino-http';

import { env } from './env.js';

const transport =
  env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: true,
        },
      }
    : undefined;

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,

  transport,

  redact: {
    paths: [
      'req.headers.authorization',
      'request.headers.authorization',
      'headers.authorization',
      'authorization',
      'token',
      'accessToken',
      'refreshToken',
      'password',
      'JWT_SECRET',
    ],
    censor: '[REDACTED]',
  },

  base: {
    service: 'task-management-node-services',
    environment: env.NODE_ENV,
  },
});

export const httpLogger = pinoHttp({
  logger,

  customLogLevel(req, res, error) {
    if (error || res.statusCode >= 500) {
      return 'error';
    }

    if (res.statusCode >= 400) {
      return 'warn';
    }

    return 'info';
  },

  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} completed with ${res.statusCode}`;
  },

  customErrorMessage(req, res) {
    return `${req.method} ${req.url} failed with ${res.statusCode}`;
  },

  serializers: {
    req(request) {
      return {
        id: request.id,
        method: request.method,
        url: request.url,
        remoteAddress: request.remoteAddress,
      };
    },

    res(response) {
      return {
        statusCode: response.statusCode,
      };
    },

    err: pino.stdSerializers.err,
  },
});
