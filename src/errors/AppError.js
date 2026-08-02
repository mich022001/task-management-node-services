export class AppError extends Error {
  constructor(
    message,
    {
      statusCode = 500,
      code = 'INTERNAL_SERVER_ERROR',
      errors,
      cause,
    } = {},
  ) {
    super(message, { cause });

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;

    if (errors !== undefined) {
      this.errors = errors;
    }

    Error.captureStackTrace?.(this, AppError);
  }
}
