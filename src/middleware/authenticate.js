import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

function getBearerToken(authorizationHeader) {
  if (!authorizationHeader) {
    throw new AppError('Authentication token is required.', {
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

  return token;
}

function normalizeAuthenticatedUser(payload) {
  const id = payload.id ?? payload.sub;

  if (!id) {
    throw new AppError('Token subject is missing.', {
      statusCode: 401,
      code: 'INVALID_TOKEN_PAYLOAD',
    });
  }

  return {
    id: String(id),
    email: payload.email ?? null,
    role: payload.role ?? null,
    isActive: payload.is_active ?? payload.isActive ?? null,
    claims: payload,
  };
}

export function authenticate(req, res, next) {
  try {
    const token = getBearerToken(req.get('authorization'));

    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
    });

    if (typeof payload === 'string') {
      throw new AppError('Invalid token payload.', {
        statusCode: 401,
        code: 'INVALID_TOKEN_PAYLOAD',
      });
    }

    req.user = normalizeAuthenticatedUser(payload);

    return next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

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
