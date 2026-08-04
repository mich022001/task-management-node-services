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

const reportDateSchema = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    'Date must use the YYYY-MM-DD format.',
  )
  .refine(
    (value) => {
      const [year, month, day] = value.split('-').map(Number);
      const parsedDate = new Date(Date.UTC(year, month - 1, day));

      return (
        parsedDate.getUTCFullYear() === year &&
        parsedDate.getUTCMonth() === month - 1 &&
        parsedDate.getUTCDate() === day
      );
    },
    'Date must be a valid calendar date.',
  );

const commaSeparatedValuesSchema = (itemSchema) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value, context) => {
      if (value === undefined) {
        return [];
      }

      const rawValues = Array.isArray(value) ? value : [value];

      const values = rawValues
        .flatMap((item) => item.split(','))
        .map((item) => item.trim())
        .filter(Boolean);

      const parsed = z.array(itemSchema).safeParse(values);

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          context.addIssue({
            code: 'custom',
            message: issue.message,
          });
        }

        return z.NEVER;
      }

      return [...new Set(parsed.data)];
    });

export const teamReportParamsSchema = z.object({
  teamId: teamIdentifierSchema,
});

export const teamReportQuerySchema = z
  .object({
    date_from: reportDateSchema.optional(),
    date_to: reportDateSchema.optional(),

    date_field: z
      .enum(['created_at', 'due_date', 'completed_at'])
      .default('due_date'),

    member_ids: commaSeparatedValuesSchema(
      teamIdentifierSchema,
    ),

    statuses: commaSeparatedValuesSchema(
      z.enum([
        'pending',
        'in_progress',
        'completed',
        'cancelled',
      ]),
    ),

    priorities: commaSeparatedValuesSchema(
      z.enum(['low', 'medium', 'high']),
    ),
  })
  .superRefine((query, context) => {
    if (
      query.date_from &&
      query.date_to &&
      query.date_from > query.date_to
    ) {
      context.addIssue({
        code: 'custom',
        path: ['date_to'],
        message: 'date_to must not be earlier than date_from.',
      });
    }
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
