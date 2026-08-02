import { jest } from '@jest/globals';

import { retry } from '../src/utils/retry.js';

describe('Retry Utility', () => {
  test('returns immediately when successful', async () => {
    const operation = jest.fn().mockResolvedValue('success');

    const result = await retry(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test('retries until success', async () => {
    let attempts = 0;

    const result = await retry(
      async () => {
        attempts += 1;

        if (attempts < 3) {
          throw new Error('temporary');
        }

        return 'done';
      },
      {
        retries: 3,
        delay: 0,
      },
    );

    expect(result).toBe('done');
    expect(attempts).toBe(3);
  });

  test('throws after max retries', async () => {
    let attempts = 0;

    await expect(
      retry(
        async () => {
          attempts += 1;

          throw new Error('failed');
        },
        {
          retries: 2,
          delay: 0,
        },
      ),
    ).rejects.toThrow('failed');

    expect(attempts).toBe(3);
  });

  test('does not retry when shouldRetry returns false', async () => {
    let attempts = 0;

    await expect(
      retry(
        async () => {
          attempts += 1;

          throw new Error('stop');
        },
        {
          retries: 5,
          delay: 0,
          shouldRetry: () => false,
        },
      ),
    ).rejects.toThrow('stop');

    expect(attempts).toBe(1);
  });
});
