import { AppError } from '../errors/AppError.js';
import {
  configureNotificationProcessor,
  enqueueNotification,
  processQueue,
} from '../queues/notification.queue.js';
import { processNotification } from '../services/notification.service.js';
import { validateNotification } from '../validation/notification.schema.js';

configureNotificationProcessor(processNotification);

function formatValidationErrors(issues) {
  return issues.reduce((errors, issue) => {
    const field = issue.path.join('.') || 'request';

    if (!errors[field]) {
      errors[field] = [];
    }

    errors[field].push(issue.message);

    return errors;
  }, {});
}

export function queueNotification(req, res, next) {
  try {
    const validationResult = validateNotification(req.body);

    if (!validationResult.success) {
      throw new AppError('Notification request validation failed.', {
        statusCode: 422,
        code: 'VALIDATION_FAILED',
        errors: formatValidationErrors(validationResult.error.issues),
      });
    }

    const job = enqueueNotification(validationResult.data);

    void processQueue();

    return res.status(202).json({
      message: 'Notification queued successfully.',
      data: {
        job: {
          id: job.id,
          type: job.type,
          status: job.status,
          created_at: job.created_at,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
}
