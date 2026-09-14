import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../logging/logger.js';
import { AppError, isAppError } from './AppError.js';
import { DEFAULT_MESSAGE } from './errorCodes.js';
import type { ErrorCode } from './errorCodes.js';

/** body-parser tags its failures with a `type`; these are the ones we map. */
const BODY_PARSER_CODES: Record<string, ErrorCode> = {
  'entity.parse.failed': 'MALFORMED_JSON',
  'entity.too.large': 'PAYLOAD_TOO_LARGE',
};

function bodyParserType(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const type = (error as { type?: unknown }).type;
  return typeof type === 'string' ? type : null;
}

/**
 * Narrows a thrown value to something presentable. Only AppError (and the
 * body-parser failures we recognise) survive with their own message — anything
 * else becomes an opaque INTERNAL so implementation detail stays server-side.
 */
function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  const parserType = bodyParserType(error);
  if (parserType !== null && parserType in BODY_PARSER_CODES) {
    return new AppError(BODY_PARSER_CODES[parserType], undefined, {
      cause: error,
    });
  }

  return new AppError('INTERNAL', undefined, { cause: error });
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'NOT_FOUND',
    requestId: req.id,
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);

  const context = {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    code: appError.code,
    status: appError.status,
  };

  if (appError.code === 'INTERNAL') {
    // The only place the original error is recorded in full.
    const cause = appError.reason;
    logger.error('unhandled error', {
      ...context,
      cause: cause instanceof Error ? cause.message : String(cause),
      stack: cause instanceof Error ? cause.stack : undefined,
    });
  } else {
    logger.warn('request failed', { ...context, reason: appError.message });
  }

  // Express skips the error handler entirely once headers are flushed; if a
  // stream failed mid-response all we can do is abort it.
  if (res.headersSent) {
    res.end();
    return;
  }

  res.status(appError.status).json({
    error:
      appError.code === 'INTERNAL'
        ? DEFAULT_MESSAGE.INTERNAL
        : appError.message,
    code: appError.code,
    requestId: req.id,
    ...(appError.details === undefined ? {} : { details: appError.details }),
  });
};
