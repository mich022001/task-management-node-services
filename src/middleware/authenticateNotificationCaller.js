import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

function safeCompare(actual, expected) {
  const actualBuffer = Buffer.from(String(actual));
  const expectedBuffer = Buffer.from(String(expected));

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function authenticateService(req) {
  const serviceKey = req.get('x-service-key');

  if (!serviceKey) {
    return false;
  }

  if (!safeCompare(serviceKey, env.NODE_SERVICE_KEY)) {
    throw new AppError('The service key is invalid.', {
      statusCode: 401,
      code: 'INVALID_SERVICE_KEY',
    });
  }

  req.notificationCaller = {
    type: 'service',
    id: 'laravel-api',
    role: 'service',
  };

  return true;
}

function authenticateUser(req) {
  const authorizationHeader = req.get('authorization');

  if (!authorizationHeader) {
    throw new AppError('Authentication credentials are required.', {
      statusCode: 401,
      code: 'AUTHENTICATION_REQUIRED',
    });
  }

  const [scheme, token, ...extraParts] = authorizationHeader
    .trim()
    .split(/\s+/);

  if (scheme?.toLowerCase() !== 'bearer' || !token || extraParts.length > 0) {
    throw new AppError(
      'Authorization header must use the Bearer token format.',
      {
        statusCode: 401,
        code: 'INVALID_AUTHORIZATION_HEADER',
      },
    );
  }

  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
  });

  if (typeof payload === 'string') {
    throw new AppError('Invalid token payload.', {
      statusCode: 401,
      code: 'INVALID_TOKEN_PAYLOAD',
    });
  }

  const id = payload.id ?? payload.sub;

  if (!id) {
    throw new AppError('Token subject is missing.', {
      statusCode: 401,
      code: 'INVALID_TOKEN_PAYLOAD',
    });
  }

  if (!['admin', 'manager'].includes(payload.role)) {
    throw new AppError('You do not have permission to perform this action.', {
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  req.notificationCaller = {
    type: 'user',
    id: String(id),
    role: payload.role,
  };

  return true;
}

export function authenticateNotificationCaller(req, _res, next) {
  try {
    if (authenticateService(req)) {
      return next();
    }

    authenticateUser(req);

    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(
        new AppError('Authentication token has expired.', {
          statusCode: 401,
          code: 'TOKEN_EXPIRED',
          cause: error,
        }),
      );
    }

    if (
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.NotBeforeError
    ) {
      return next(
        new AppError('Authentication token is invalid.', {
          statusCode: 401,
          code: 'INVALID_TOKEN',
          cause: error,
        }),
      );
    }

    return next(error);
  }
}
