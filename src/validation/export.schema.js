import { z } from 'zod';

export const supportedExportFormats = Object.freeze(['csv', 'json', 'xlsx']);

const teamIdentifierSchema = z
  .string()
  .trim()
  .uuid('Expected a valid team UUID.');

export const exportFormatSchema = z.object({
  format: z.enum(supportedExportFormats, {
    message: 'Unsupported export format.',
  }),
});

export const taskExportQuerySchema = z.object({
  team_id: teamIdentifierSchema.optional(),
});

export const analyticsSummaryExportQuerySchema = z.object({
  team_id: teamIdentifierSchema.optional(),
});

export const deadlineExportQuerySchema = z.object({
  team_id: teamIdentifierSchema.optional(),

  days: z.coerce
    .number()
    .int('Days must be an integer.')
    .min(1, 'Days must be at least 1.')
    .max(90, 'Days must not exceed 90.')
    .default(7),
});

export function formatExportValidationErrors(error) {
  return error.issues.reduce((errors, issue) => {
    const field = issue.path.join('.') || 'request';

    if (!errors[field]) {
      errors[field] = [];
    }

    errors[field].push(issue.message);

    return errors;
  }, {});
}
