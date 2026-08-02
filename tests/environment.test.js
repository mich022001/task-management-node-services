import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), '..');

function runEnvImport(overrides = {}) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import('./src/config/env.js')",
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '3001',
        FRONTEND_URL: 'http://localhost:5173',
        JWT_SECRET: 'test-jwt-secret-key-1234567890abcdef',
        LOG_LEVEL: 'silent',
        ...overrides,
      },
      encoding: 'utf8',
    },
  );
}

describe('Environment validation', () => {
  test('loads successfully with valid environment variables', () => {
    const result = runEnvImport();

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('fails when JWT_SECRET is missing', () => {
    const result = runEnvImport({
      JWT_SECRET: '',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('JWT_SECRET');
    expect(result.stderr).toContain(
      'Invalid environment configuration.',
    );
  });

  test('fails when PORT is outside the valid range', () => {
    const result = runEnvImport({
      PORT: '70000',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PORT');
  });

  test('fails when NODE_ENV is unsupported', () => {
    const result = runEnvImport({
      NODE_ENV: 'staging',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('NODE_ENV');
  });

  test('fails when FRONTEND_URL is invalid', () => {
    const result = runEnvImport({
      FRONTEND_URL: 'not-a-url',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('FRONTEND_URL');
  });
});
