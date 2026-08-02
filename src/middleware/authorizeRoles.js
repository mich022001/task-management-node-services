import { AppError } from '../errors/AppError.js';

const supportedRoles = new Set([
  'admin',
  'manager',
  'team_member',
]);

export function authorizeRoles(...allowedRoles) {
  if (allowedRoles.length === 0) {
    throw new TypeError(
      'authorizeRoles requires at least one permitted role.',
    );
  }

  const invalidRoles = allowedRoles.filter(
    (role) => !supportedRoles.has(role),
  );

  if (invalidRoles.length > 0) {
    throw new TypeError(
      `Unsupported role configuration: ${invalidRoles.join(', ')}`,
    );
  }

  const permittedRoles = new Set(allowedRoles);

  return function roleAuthorizationMiddleware(req, res, next) {
    if (!req.user) {
      return next(
        new AppError('Authentication is required.', {
          statusCode: 401,
          code: 'AUTHENTICATION_REQUIRED',
        }),
      );
    }

    if (!req.user.role) {
      return next(
        new AppError(
          'The authenticated token does not contain a role claim.',
          {
            statusCode: 403,
            code: 'ROLE_CLAIM_REQUIRED',
          },
        ),
      );
    }

    if (!permittedRoles.has(req.user.role)) {
      return next(
        new AppError(
          'You are not authorized to perform this action.',
          {
            statusCode: 403,
            code: 'FORBIDDEN',
          },
        ),
      );
    }

    return next();
  };
}
