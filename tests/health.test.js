import request from 'supertest';

import app from '../src/app.js';

describe('Health endpoint', () => {
  test('returns service health information', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        message: 'Task Management Node.js Services',
        status: 'ok',
        environment: 'test',
        version: expect.any(String),
        uptime: expect.any(Number),
        timestamp: expect.any(String),
      }),
    );

    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
    expect(response.body.uptime).toBeGreaterThanOrEqual(0);
  });

  test('returns JSON content type', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/json/);
  });
});
