import { jest } from '@jest/globals';

const sendMailMock = jest.fn();

jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: jest.fn(() => ({
      sendMail: sendMailMock,
    })),
  },
}));

const { sendMail } = await import('../../src/services/mail.service.js');

describe('Mail service', () => {
  beforeEach(() => {
    sendMailMock.mockReset();
  });

  test('sends an email with expected fields', async () => {
    sendMailMock.mockResolvedValue({
      messageId: 'message-123',
      accepted: ['member@test.com'],
      rejected: [],
      response: '250 Accepted',
    });

    const result = await sendMail({
      to: 'member@test.com',
      subject: 'Task assigned',
      text: 'A task was assigned to you.',
      html: '<p>A task was assigned to you.</p>',
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'member@test.com',
        subject: 'Task assigned',
        text: 'A task was assigned to you.',
        html: '<p>A task was assigned to you.</p>',
        from: {
          name: 'Task Management Platform',
          address: 'no-reply@example.com',
        },
      }),
    );

    expect(result).toEqual({
      messageId: 'message-123',
      accepted: ['member@test.com'],
      rejected: [],
      response: '250 Accepted',
    });
  });

  test('returns the message id after delivery', async () => {
    sendMailMock.mockResolvedValue({
      messageId: 'message-456',
    });

    const result = await sendMail({
      to: 'manager@test.com',
      subject: 'Task completed',
      text: 'The task was completed.',
      html: '<p>The task was completed.</p>',
    });

    expect(result.messageId).toBe('message-456');
  });

  test('normalizes SMTP delivery failures', async () => {
    sendMailMock.mockRejectedValue(new Error('SMTP connection failed'));

    await expect(
      sendMail({
        to: 'member@test.com',
        subject: 'Test',
        text: 'Test message',
        html: '<p>Test message</p>',
      }),
    ).rejects.toMatchObject({
      name: 'MailDeliveryError',
      statusCode: 502,
      code: 'MAIL_DELIVERY_FAILED',
      message: 'Unable to deliver notification email.',
    });
  });
});
