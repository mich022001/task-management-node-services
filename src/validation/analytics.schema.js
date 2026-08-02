import { z } from 'zod';

const positiveIntegerSchema = z.coerce
  .number()
  .int('Value must be an integer.')
  .positive('Value must be greater than zero.');

export const taskSummaryQuerySchema = z.object({
  team_id: positiveIntegerSchema.optional(),
});

export const teamProductivityParamsSchema = z.object({
  teamId: positiveIntegerSchema,
});

export const upcomingDeadlinesQuerySchema = z.object({
  days: z.coerce
    .number()
    .int('Days must be an integer.')
    .min(1, 'Days must be at least 1.')
    .max(90, 'Days must not exceed 90.')
    .default(7),

  team_id: positiveIntegerSchema.optional(),
});

export function formatValidationErrors(error) {
  const errors = {};

  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'request';

    if (!errors[field]) {
      errors[field] = [];
    }

    errors[field].push(issue.message);
  }

  return errors;
}
