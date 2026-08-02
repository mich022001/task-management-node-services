import request from 'supertest';

import app from '../src/app.js';
import {
  createExpiredToken,
  createToken,
} from './helpers/jwt.js';

describe('JWT authentication middleware', () => {
  test('rejects a request without a token', async () => {
    const response = await request(app)
      .get('/api/v1/protected/profile')
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        message: 'Authentication token is required.',
        code: 'AUTHENTICATION_REQUIRED',
      }),
    );
  });

  test('rejects a malformed authorization header', async () => {
    const token = createToken();

    const response = await request(app)
      .get('/api/v1/protected/profile')
      .set('Authorization', `Token ${token}`)
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'INVALID_AUTHORIZATION_HEADER',
      }),
    );
  });

  test('rejects an invalid token', async () => {
    const response = await request(app)
      .get('/api/v1/protected/profile')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        message: 'Authentication token is invalid.',
        code: 'INVALID_TOKEN',
      }),
    );
  });

  test('rejects an expired token', async () => {
    const token = createExpiredToken();

    const response = await request(app)
      .get('/api/v1/protected/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        message: 'Authentication token has expired.',
        code: 'TOKEN_EXPIRED',
      }),
    );
  });

  test('allows a valid token and attaches the user', async () => {
    const token = createToken({
      sub: '15',
      email: 'valid.user@test.com',
      role: 'manager',
      is_active: true,
    });

    const response = await request(app)
      .get('/api/v1/protected/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      message: 'Authenticated profile retrieved successfully.',
      data: {
        user: {
          id: '15',
          email: 'valid.user@test.com',
          role: 'manager',
          is_active: true,
        },
      },
    });
  });

  test('rejects a token without a subject', async () => {
    const token = createToken(
      {
        sub: undefined,
        id: undefined,
      },
      {
        mutatePayload: false,
      },
    );

    const response = await request(app)
      .get('/api/v1/protected/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(response.body.code).toBe(
      'INVALID_TOKEN_PAYLOAD',
    );
  });
});
