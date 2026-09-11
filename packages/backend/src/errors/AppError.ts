import { DEFAULT_MESSAGE, ERROR_STATUS } from './errorCodes.js';
import type { ErrorCode } from './errorCodes.js';

/**
 * An error whose message is safe to return to the caller.
 *
 * Anything thrown that is *not* an AppError is treated as a defect: the error
 * handler logs it in full and answers with an opaque 500, so an unexpected
 * stack trace or SQL fragment can never leak through the API.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Extra machine-readable context for the client (e.g. offending fields). */
  readonly details?: Record<string, unknown>;
  /**
   * The originating error, kept for the log only. Declared here rather than
   * using the ES2022 `Error` cause option, since the backend targets ES2020.
   */
  readonly reason?: unknown;

  constructor(
    code: ErrorCode,
    message?: string,
    options: { details?: Record<string, unknown>; cause?: unknown } = {}
  ) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = options.details;
    this.reason = options.cause;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(
    message?: string,
    details?: Record<string, unknown>
  ): AppError {
    return new AppError('BAD_REQUEST', message, { details });
  }

  static validation(
    message?: string,
    details?: Record<string, unknown>
  ): AppError {
    return new AppError('VALIDATION_FAILED', message, { details });
  }

  static unauthorized(message?: string): AppError {
    return new AppError('UNAUTHORIZED', message);
  }

  static forbidden(message?: string): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static notFound(message?: string): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static conflict(message?: string): AppError {
    return new AppError('CONFLICT', message);
  }

  static unavailable(message?: string): AppError {
    return new AppError('SERVICE_UNAVAILABLE', message);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
