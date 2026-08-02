import { Router } from 'express';

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = Router();

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    is_active: user.isActive,
  };
}

router.get('/profile', authenticate, (req, res) => {
  return res.status(200).json({
    message: 'Authenticated profile retrieved successfully.',
    data: {
      user: serializeUser(req.user),
    },
  });
});

router.get('/admin', authenticate, authorizeRoles('admin'), (req, res) => {
  return res.status(200).json({
    message: 'Admin endpoint accessed successfully.',
    data: {
      user: serializeUser(req.user),
    },
  });
});

router.get(
  '/management',
  authenticate,
  authorizeRoles('admin', 'manager'),
  (req, res) => {
    return res.status(200).json({
      message: 'Management endpoint accessed successfully.',
      data: {
        user: serializeUser(req.user),
      },
    });
  },
);

if (env.NODE_ENV !== 'production') {
  router.get('/error', (_req, _res, next) => {
    return next(
      new AppError('Intentional test error.', {
        statusCode: 500,
        code: 'INTENTIONAL_TEST_ERROR',
      }),
    );
  });
}

export default router;
