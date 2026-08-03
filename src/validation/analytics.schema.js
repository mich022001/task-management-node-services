import { z } from 'zod';

const teamIdentifierSchema = z
  .string()
  .trim()
  .uuid('Value must be a valid team UUID.');

export const taskSummaryQuerySchema = z.object({
  team_id: teamIdentifierSchema.optional(),
});

export const teamProductivityParamsSchema = z.object({
  teamId: teamIdentifierSchema,
});

export const upcomingDeadlinesQuerySchema = z.object({
  days: z.coerce
    .number()
    .int('Days must be an integer.')
    .min(1, 'Days must be at least 1.')
    .max(90, 'Days must not exceed 90.')
    .default(7),

  team_id: teamIdentifierSchema.optional(),
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
