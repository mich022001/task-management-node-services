import { z } from 'zod';

const taskStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];

const notificationTypes = [
  'task_assigned',
  'task_status_changed',
  'task_completed',
  'custom',
];

const taskNotificationSchema = z.object({
  type: z.enum(['task_assigned', 'task_completed']),

  task_id: z.string().trim().uuid('Task ID must be a valid UUID.'),

  recipient_email: z.email().optional(),
  subject: z.string().trim().min(1).max(255).optional(),
  message: z.string().trim().min(1).optional(),
});

const taskStatusChangedSchema = z
  .object({
    type: z.literal('task_status_changed'),

    task_id: z.string().trim().uuid('Task ID must be a valid UUID.'),

    previous_status: z.enum(taskStatuses),
    new_status: z.enum(taskStatuses),
  })
  .refine((payload) => payload.previous_status !== payload.new_status, {
    message: 'Previous and new task statuses must differ.',
    path: ['new_status'],
  });

const customNotificationSchema = z.object({
  type: z.literal('custom'),

  recipient_email: z.email(),
  subject: z.string().trim().min(1).max(255),
  message: z.string().trim().min(1),

  task_id: z.never().optional(),
});

export const notificationSchema = z.discriminatedUnion('type', [
  taskNotificationSchema,
  taskStatusChangedSchema,
  customNotificationSchema,
]);

export function validateNotification(payload) {
  return notificationSchema.safeParse(payload);
}

export { notificationTypes, taskStatuses };
