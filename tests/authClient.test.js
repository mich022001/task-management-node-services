import AxiosMockAdapter from 'axios-mock-adapter';

import { login } from '../src/clients/laravel/authClient.js';
import { publicLaravelAxios } from '../src/clients/laravel/publicLaravelClient.js';

describe('Laravel authentication client', () => {
  let mock;

  beforeEach(() => {
    mock = new AxiosMockAdapter(publicLaravelAxios);
  });

  afterEach(() => {
    mock.restore();
  });

  test('logs in through the public Laravel API', async () => {
    mock
      .onPost('/auth/login', {
        email: 'admin@test.com',
        password: 'password123',
      })
      .reply(200, {
        message: 'Login successful.',
        data: {
          access_token: 'jwt-token',
        },
      });

    const response = await login({
      email: 'admin@test.com',
      password: 'password123',
    });

    expect(response.data.access_token).toBe('jwt-token');
  });

  test('does not attach the internal service key', async () => {
    mock.onPost('/auth/login').reply((config) => {
      expect(config.headers['X-Service-Key']).toBeUndefined();

      return [
        200,
        {
          data: {
            access_token: 'jwt-token',
          },
        },
      ];
    });

    await login({
      email: 'admin@test.com',
      password: 'password123',
    });
  });

  test('preserves Laravel authentication failures', async () => {
    mock.onPost('/auth/login').reply(401, {
      message: 'Invalid credentials.',
      code: 'INVALID_CREDENTIALS',
    });

    await expect(
      login({
        email: 'admin@test.com',
        password: 'wrong-password',
      }),
    ).rejects.toMatchObject({
      name: 'LaravelClientError',
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials.',
    });
  });

  test('preserves Laravel validation errors', async () => {
    mock.onPost('/auth/login').reply(422, {
      message: 'The email field is required.',
      errors: {
        email: ['The email field is required.'],
      },
    });

    await expect(
      login({
        password: 'password123',
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      errors: {
        email: ['The email field is required.'],
      },
    });
  });
});
