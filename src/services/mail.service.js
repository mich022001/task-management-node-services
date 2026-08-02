import nodemailer from 'nodemailer';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { MailDeliveryError } from '../errors/MailDeliveryError.js';

export const mailTransporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,

  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function sendMail({ to, subject, text, html }) {
  try {
    const result = await mailTransporter.sendMail({
      from: {
        name: env.SMTP_FROM_NAME,
        address: env.SMTP_FROM_EMAIL,
      },
      to,
      subject,
      text,
      html,
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
