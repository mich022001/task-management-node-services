import AxiosMockAdapter from 'axios-mock-adapter';

import {
  laravelAxios,
  laravelRequest,
} from '../src/clients/laravel/laravelClient.js';

describe('Laravel API Client', () => {
  let mock;

  beforeEach(() => {
    mock = new AxiosMockAdapter(laravelAxios);
  });

  afterEach(() => {
    mock.restore();
  });

  test('adds the X-Service-Key header', async () => {
    mock.onGet('/health').reply((config) => {
      expect(config.headers['X-Service-Key']).toBeDefined();

      return [
        200,
        {
          message: 'ok',
        },
      ];
    });

    const response = await laravelRequest({
      method: 'GET',
      url: '/health',
    });

    expect(response.message).toBe('ok');
  });

  test('returns successful responses', async () => {
    mock.onGet('/users').reply(200, {
      data: ['user1'],
    });

    const response = await laravelRequest({
      method: 'GET',
      url: '/users',
    });

    expect(response.data).toEqual(['user1']);
  });

  test('throws LaravelClientError on 404', async () => {
    mock.onGet('/users/999').reply(404, {
      message: 'Not Found',
    });

    await expect(
      laravelRequest({
        method: 'GET',
        url: '/users/999',
      }),
    ).rejects.toHaveProperty('statusCode', 404);
  });

  test('retries on server errors', async () => {
    let attempts = 0;

    mock.onGet('/tasks').reply(() => {
      attempts++;

      if (attempts < 3) {
        return [
          500,
          {
            message: 'Server Error',
          },
        ];
      }

      return [
        200,
        {
          success: true,
        },
      ];
    });

    const response = await laravelRequest({
      method: 'GET',
      url: '/tasks',
    });

    expect(attempts).toBe(3);
    expect(response.success).toBe(true);
  });

  test('does not retry client errors', async () => {
    let attempts = 0;

    mock.onGet('/teams').reply(() => {
      attempts++;

      return [
        400,
        {
          message: 'Bad Request',
        },
      ];
    });

    await expect(
      laravelRequest({
        method: 'GET',
        url: '/teams',
      }),
    ).rejects.toHaveProperty('statusCode', 400);

    expect(attempts).toBe(1);
  });

  test('normalizes timeout errors', async () => {
    mock.onGet('/health').timeout();

    await expect(
      laravelRequest({
        method: 'GET',
        url: '/health',
      }),
    ).rejects.toMatchObject({
      name: 'LaravelClientError',
      statusCode: 504,
      code: 'LARAVEL_TIMEOUT',
      retryable: true,
    });
  });

  test('normalizes connection failures', async () => {
    mock.onGet('/health').networkError();

    await expect(
      laravelRequest({
        method: 'GET',
        url: '/health',
      }),
    ).rejects.toMatchObject({
      name: 'LaravelClientError',
      statusCode: 503,
      code: 'LARAVEL_UNAVAILABLE',
      retryable: true,
    });
  });
});
