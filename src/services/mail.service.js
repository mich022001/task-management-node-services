import nodemailer from 'nodemailer';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { MailDeliveryError } from '../errors/MailDeliveryError.js';
import { retry } from '../utils/retry.js';

const RETRYABLE_SMTP_CODES = new Set([
  'ECONNECTION',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ESOCKET',
]);

export const mailTransporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,

  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

function isRetryableMailError(error) {
  const responseCode = Number(error?.responseCode);

  if (Number.isInteger(responseCode)) {
    return responseCode >= 400 && responseCode < 500;
  }

  return RETRYABLE_SMTP_CODES.has(error?.code);
}

function buildMailPayload({ to, subject, text, html }) {
  return {
    from: {
      name: env.SMTP_FROM_NAME,
      address: env.SMTP_FROM_EMAIL,
    },
    to,
    subject,
    text,
    html,
  };
}

export async function sendMail({ to, subject, text, html }) {
  const payload = buildMailPayload({
    to,
    subject,
    text,
    html,
  });

  try {
    const result = await retry(() => mailTransporter.sendMail(payload), {
      retries: env.SMTP_RETRY_ATTEMPTS,
      delay: env.SMTP_RETRY_DELAY,

      shouldRetry(error) {
        return isRetryableMailError(error);
      },

      onRetry({ attempt, retries, error }) {
        logger.warn(
          {
            attempt,
            retries,
            code: error?.code ?? null,
            responseCode: error?.responseCode ?? null,
            recipient: to,
            subject,
          },
          'Retrying email delivery.',
        );
      },
    });

    logger.info(
      {
        messageId: result.messageId,
        recipient: to,
        subject,
      },
      'Email delivered successfully.',
    );

    return {
      messageId: result.messageId,
      accepted: result.accepted ?? [],
      rejected: result.rejected ?? [],
      response: result.response ?? null,
    };
  } catch (error) {
    logger.error(
      {
        err: error,
        recipient: to,
        subject,
      },
      'Email delivery failed.',
    );

    throw new MailDeliveryError('Unable to deliver notification email.', {
      cause: error,
      details: {
        recipient: to,
      },
    });
  }
}
