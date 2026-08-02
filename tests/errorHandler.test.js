import request from 'supertest';

import app from '../src/app.js';

describe('Error handling', () => {
  test('returns 404 for an unknown route', async () => {
    const response = await request(app)
      .get('/api/v1/does-not-exist')
      .expect(404);

    expect(response.body).toEqual({
      message: 'Route not found: GET /api/v1/does-not-exist',
    });
  });

  test('returns a standardized 500 error response', async () => {
    const response = await request(app)
      .get('/api/v1/protected/error')
      .expect(500);

    expect(response.body).toEqual(
      expect.objectContaining({
        message: 'Intentional test error.',
        code: 'INTENTIONAL_TEST_ERROR',
      }),
    );
  });

  test('does not include a stack trace in the test environment', async () => {
    const response = await request(app)
      .get('/api/v1/protected/error')
      .expect(500);

    expect(response.body.stack).toBeUndefined();
  });

  test('returns a JSON error for malformed request JSON', async () => {
    const response = await request(app)
      .post('/api/v1/protected/profile')
      .set('Content-Type', 'application/json')
      .send('{"invalidJson":')
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'REQUEST_ERROR',
      }),
    );
  });
});
