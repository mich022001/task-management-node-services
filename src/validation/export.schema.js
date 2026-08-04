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

const taskExportStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'cancelled',
]);

const taskExportPrioritySchema = z.enum(['low', 'medium', 'high']);

const taskExportDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use the YYYY-MM-DD format.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);

    const parsedDate = new Date(Date.UTC(year, month - 1, day));

    return (
      parsedDate.getUTCFullYear() === year &&
      parsedDate.getUTCMonth() === month - 1 &&
      parsedDate.getUTCDate() === day
    );
  }, 'Date must be a valid calendar date.');

const taskExportNestedFiltersSchema = z
  .object({
    status: taskExportStatusSchema.optional(),
    priority: taskExportPrioritySchema.optional(),
    assigned_to: teamIdentifierSchema.optional(),
    date_from: taskExportDateSchema.optional(),
    date_to: taskExportDateSchema.optional(),
  })
  .superRefine((filters, context) => {
    if (
      filters.date_from &&
      filters.date_to &&
      filters.date_from > filters.date_to
    ) {
      context.addIssue({
        code: 'custom',
        path: ['date_to'],
        message: 'date_to must not be earlier than date_from.',
      });
    }
  });

export const taskExportQuerySchema = z
  .object({
    team_id: teamIdentifierSchema.optional(),
    status: taskExportStatusSchema.optional(),
    priority: taskExportPrioritySchema.optional(),
    assigned_to: teamIdentifierSchema.optional(),
    date_from: taskExportDateSchema.optional(),
    date_to: taskExportDateSchema.optional(),
  })
  .superRefine((filters, context) => {
    if (
      filters.date_from &&
      filters.date_to &&
      filters.date_from > filters.date_to
    ) {
      context.addIssue({
        code: 'custom',
        path: ['date_to'],
        message: 'date_to must not be earlier than date_from.',
      });
    }
  });

export const taskExportBodySchema = z
  .object({
    team_id: teamIdentifierSchema.optional(),

    format: z.enum(supportedExportFormats, {
      message: 'Unsupported export format.',
    }),

    filters: taskExportNestedFiltersSchema.default({}),
  })
  .transform((request) => ({
    format: request.format,

    filters: {
      ...request.filters,
      team_id: request.team_id,
    },
  }));

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

const exportReportDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use the YYYY-MM-DD format.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);

    const parsedDate = new Date(Date.UTC(year, month - 1, day));

    return (
      parsedDate.getUTCFullYear() === year &&
      parsedDate.getUTCMonth() === month - 1 &&
      parsedDate.getUTCDate() === day
    );
  }, 'Date must be a valid calendar date.');

const exportCommaSeparatedValuesSchema = (itemSchema) =>
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

export const teamReportExportQuerySchema = z
  .object({
    team_id: teamIdentifierSchema,

    date_from: exportReportDateSchema.optional(),
    date_to: exportReportDateSchema.optional(),

    date_field: z
      .enum(['created_at', 'due_date', 'completed_at'])
      .default('due_date'),

    member_ids: exportCommaSeparatedValuesSchema(teamIdentifierSchema),

    statuses: exportCommaSeparatedValuesSchema(
      z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
    ),

    priorities: exportCommaSeparatedValuesSchema(
      z.enum(['low', 'medium', 'high']),
    ),
  })
  .superRefine((query, context) => {
    if (query.date_from && query.date_to && query.date_from > query.date_to) {
      context.addIssue({
        code: 'custom',
        path: ['date_to'],
        message: 'date_to must not be earlier than date_from.',
      });
    }
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
