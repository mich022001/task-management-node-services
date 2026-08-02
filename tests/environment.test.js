import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), '..');

function runEnvImport(overrides = {}) {
  return spawnSync(
    process.execPath,
    ['--input-type=module', '-e', "import('./src/config/env.js')"],
    {
      cwd: projectRoot,
      env: {
        ...process.env,

        NODE_ENV: 'test',
        PORT: '3001',
        FRONTEND_URL: 'http://localhost:5173',
        JWT_SECRET: 'test-jwt-secret-key-1234567890abcdef',
        LOG_LEVEL: 'silent',

        LARAVEL_API_URL: 'http://127.0.0.1:8000/api/v1',
        LARAVEL_INTERNAL_API_URL: 'http://127.0.0.1:8000/api/v1/internal',
        LARAVEL_SERVICE_KEY: 'test-service-key-1234567890-abcdef',
        LARAVEL_TIMEOUT: '5000',
        LARAVEL_RETRY_ATTEMPTS: '2',
        LARAVEL_RETRY_DELAY: '300',

        SMTP_HOST: 'localhost',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
        SMTP_USER: 'test-user',
        SMTP_PASS: 'test-password',
        SMTP_FROM_NAME: 'Task Management Platform',
        SMTP_FROM_EMAIL: 'no-reply@example.com',

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
    expect(result.stderr).toContain('Invalid environment configuration.');
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

  test('fails when LARAVEL_API_URL is invalid', () => {
    const result = runEnvImport({
      LARAVEL_API_URL: 'not-a-url',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('LARAVEL_API_URL');
  });

  test('fails when LARAVEL_INTERNAL_API_URL is invalid', () => {
    const result = runEnvImport({
      LARAVEL_INTERNAL_API_URL: 'invalid-url',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('LARAVEL_INTERNAL_API_URL');
  });

  test('fails when LARAVEL_SERVICE_KEY is too short', () => {
    const result = runEnvImport({
      LARAVEL_SERVICE_KEY: 'short-key',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('LARAVEL_SERVICE_KEY');
    expect(result.stderr).toContain('must contain at least 32 characters');
  });

  test('fails when LARAVEL_TIMEOUT is zero', () => {
    const result = runEnvImport({
      LARAVEL_TIMEOUT: '0',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('LARAVEL_TIMEOUT');
  });

  test('fails when LARAVEL_TIMEOUT is not numeric', () => {
    const result = runEnvImport({
      LARAVEL_TIMEOUT: 'invalid',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('LARAVEL_TIMEOUT');
  });

  test('fails when LARAVEL_RETRY_ATTEMPTS is negative', () => {
    const result = runEnvImport({
      LARAVEL_RETRY_ATTEMPTS: '-1',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('LARAVEL_RETRY_ATTEMPTS');
  });

  test('fails when LARAVEL_RETRY_ATTEMPTS exceeds maximum', () => {
    const result = runEnvImport({
      LARAVEL_RETRY_ATTEMPTS: '11',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('LARAVEL_RETRY_ATTEMPTS');
  });

  test('fails when LARAVEL_RETRY_DELAY is negative', () => {
    const result = runEnvImport({
      LARAVEL_RETRY_DELAY: '-1',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('LARAVEL_RETRY_DELAY');
  });

  test('fails when LARAVEL_RETRY_DELAY is not numeric', () => {
    const result = runEnvImport({
      LARAVEL_RETRY_DELAY: 'invalid',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('LARAVEL_RETRY_DELAY');
  });

  test('fails when SMTP_HOST is missing', () => {
    const result = runEnvImport({
      SMTP_HOST: '',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SMTP_HOST');
  });

  test('fails when SMTP_PORT is outside the valid range', () => {
    const result = runEnvImport({
      SMTP_PORT: '70000',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SMTP_PORT');
  });

  test('fails when SMTP_SECURE is invalid', () => {
    const result = runEnvImport({
      SMTP_SECURE: 'yes',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SMTP_SECURE');
  });

  test('fails when SMTP_USER is missing', () => {
    const result = runEnvImport({
      SMTP_USER: '',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SMTP_USER');
  });

  test('fails when SMTP_PASS is missing', () => {
    const result = runEnvImport({
      SMTP_PASS: '',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SMTP_PASS');
  });

  test('fails when SMTP_FROM_EMAIL is invalid', () => {
    const result = runEnvImport({
      SMTP_FROM_EMAIL: 'invalid-email',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SMTP_FROM_EMAIL');
  });
});
