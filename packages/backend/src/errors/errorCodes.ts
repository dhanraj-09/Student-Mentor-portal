/**
 * Transport-level error codes.
 *
 * These describe *how* a request failed, not *why* in domain terms — the
 * per-route maps own the domain wording, because the same shape of failure
 * needs different prose in different features ("You can only assign students
 * to yourself" vs "You can only create queries for yourself"). What is
 * centralised here is the code -> HTTP status mapping, so a status is never
 * picked ad hoc.
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'MALFORMED_JSON',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL',
  'SERVICE_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  MALFORMED_JSON: 400,
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Message sent when the thrown error carries none of its own. Deliberately
 * vague for INTERNAL: the real cause goes to the log, never to the client.
 */
export const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  BAD_REQUEST: 'The request could not be processed',
  MALFORMED_JSON: 'Request body is not valid JSON',
  VALIDATION_FAILED: 'The request failed validation',
  UNAUTHORIZED: 'Authentication is required',
  FORBIDDEN: 'You do not have access to this resource',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'The request conflicts with the current state',
  PAYLOAD_TOO_LARGE: 'Request body is too large',
  RATE_LIMITED: 'Too many requests. Please try again later',
  INTERNAL: 'Internal server error',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable',
};
