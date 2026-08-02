import { AppError } from './AppError.js';

export class MailDeliveryError extends AppError {
  constructor(message, { cause, details } = {}) {
    super(message, {
      statusCode: 502,
      code: 'MAIL_DELIVERY_FAILED',
      cause,
      errors: details,
    });

    this.name = 'MailDeliveryError';
  }
}
