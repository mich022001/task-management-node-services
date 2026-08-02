import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({
  quiet: true,
});

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3000),

  FRONTEND_URL: z
    .url()
    .default('http://localhost:5173'),

  JWT_SECRET: z
    .string()
    .trim()
    .min(32, 'JWT_SECRET must contain at least 32 characters.'),

  LOG_LEVEL: z
    .enum([
      'fatal',
      'error',
      'warn',
      'info',
      'debug',
      'trace',
      'silent',
    ])
    .default('info'),
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
