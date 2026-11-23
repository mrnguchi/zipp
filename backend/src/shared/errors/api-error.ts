import { HttpException } from '@nestjs/common';

/** Only deliberately public, non-sensitive errors may expose their message. */
export class ApiError extends HttpException {
  constructor(
    readonly code: string,
    status: number,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message, status);
  }
}

export const invalidCredentials = () =>
  new ApiError('INVALID_CREDENTIALS', 401, 'Credentials could not be verified');
export const invalidChallenge = () =>
  new ApiError('INVALID_CHALLENGE', 400, 'Code is invalid or expired');
