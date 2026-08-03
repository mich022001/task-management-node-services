import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({
  quiet: true,
});

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  FRONTEND_URL: z.url().default('http://localhost:5173'),

  JWT_SECRET: z
    .string()
    .trim()
    .min(32, 'JWT_SECRET must contain at least 32 characters.'),

  NODE_SERVICE_KEY: z
    .string()
    .trim()
    .min(32, 'NODE_SERVICE_KEY must contain at least 32 characters.'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  LARAVEL_API_URL: z.url().default('http://localhost:8000/api/v1'),

  LARAVEL_INTERNAL_API_URL: z
    .url()
    .default('http://localhost:8000/api/v1/internal'),

  LARAVEL_SERVICE_KEY: z
    .string()
    .trim()
    .min(32, 'LARAVEL_SERVICE_KEY must contain at least 32 characters.'),

  LARAVEL_TIMEOUT: z.coerce.number().int().positive().default(5000),

  LARAVEL_RETRY_ATTEMPTS: z.coerce.number().int().min(0).max(10).default(2),

  LARAVEL_RETRY_DELAY: z.coerce.number().int().min(0).default(300),

  SMTP_HOST: z.string().trim().min(1),

  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),

  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  SMTP_USER: z.string().trim().min(1),

  SMTP_PASS: z.string().min(1),

  SMTP_FROM_NAME: z.string().trim().min(1).default('Task Management Platform'),

  SMTP_FROM_EMAIL: z.email().default('no-reply@example.com'),

  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
});

const validationResult = environmentSchema.safeParse(process.env);

if (!validationResult.success) {
  const issues = validationResult.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));

  process.stderr.write(
    `Environment validation failed:\n${JSON.stringify(issues, null, 2)}\n`,
  );

  throw new Error('Invalid environment configuration.');
}

export const env = Object.freeze(validationResult.data);
