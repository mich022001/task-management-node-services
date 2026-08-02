import request from 'supertest';

import app from '../src/app.js';
import { createToken } from './helpers/jwt.js';

describe('Role authorization middleware', () => {
  test('allows an Admin to access the Admin endpoint', async () => {
    const token = createToken({
      role: 'admin',
    });

    const response = await request(app)
      .get('/api/v1/protected/admin')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.message).toBe('Admin endpoint accessed successfully.');

    expect(response.body.data.user.role).toBe('admin');
    expect(response.body.data.user.claims).toBeUndefined();
  });

  test('prevents a Manager from accessing the Admin endpoint', async () => {
    const token = createToken({
      sub: '2',
      email: 'manager@test.com',
      role: 'manager',
    });

    const response = await request(app)
      .get('/api/v1/protected/admin')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'FORBIDDEN',
      }),
    );
  });

  test('allows an Admin to access the management endpoint', async () => {
    const token = createToken({
      role: 'admin',
    });

    await request(app)
      .get('/api/v1/protected/management')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  test('allows a Manager to access the management endpoint', async () => {
    const token = createToken({
      sub: '2',
      email: 'manager@test.com',
      role: 'manager',
    });

    const response = await request(app)
      .get('/api/v1/protected/management')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.user.role).toBe('manager');
  });

  test('prevents a Team Member from accessing management', async () => {
    const token = createToken({
      sub: '3',
      email: 'member@test.com',
      role: 'team_member',
    });

    const response = await request(app)
      .get('/api/v1/protected/management')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');
  });

  test('rejects role authorization when the token has no role', async () => {
    const token = createToken({
      role: undefined,
    });

    const response = await request(app)
      .get('/api/v1/protected/admin')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.code).toBe('ROLE_CLAIM_REQUIRED');
  });
});
