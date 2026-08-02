import jwt from 'jsonwebtoken';

import { env } from '../../src/config/env.js';

export function createToken(
  payload = {},
  options = {},
) {
  return jwt.sign(
    {
      sub: '1',
      email: 'admin@test.com',
      role: 'admin',
      is_active: true,
      ...payload,
    },
    env.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '1h',
      ...options,
    },
  );
}

export function createExpiredToken(payload = {}) {
  return createToken(payload, {
    expiresIn: -1,
  });
}
