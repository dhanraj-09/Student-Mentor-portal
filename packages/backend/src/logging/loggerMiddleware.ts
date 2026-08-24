import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from './logger.js';

/** Bodies are never logged; these are the only request fields worth keeping. */
function describe(req: Parameters<RequestHandler>[0]): Record<string, unknown> {
  return {
    requestId: req.id,
    method: req.method,
    // `originalUrl` keeps the mount prefix that `req.url` strips, but the query
    // string can carry identifiers, so only the path is recorded.
    path: req.originalUrl.split('?')[0],
  };
}

/**
 * Assigns a correlation id and logs one line per completed request. The id is
 * echoed back as `X-Request-Id` so a client-reported failure can be traced to
 * its server-side log line.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.id =
    typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 64
      ? incoming
      : randomUUID();
  res.setHeader('X-Request-Id', req.id);

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const context = {
      ...describe(req),
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      // Identifies the caller without logging the token itself.
      user:
        req.user === undefined
          ? undefined
          : req.user.type === 'student'
            ? `student:${req.user.registration_no}`
            : `faculty:${req.user.email}`,
    };

    if (res.statusCode >= 500) {
      logger.error('request failed', context);
    } else if (res.statusCode >= 400) {
      logger.warn('request rejected', context);
    } else {
      logger.info('request completed', context);
    }
  });

  next();
};
