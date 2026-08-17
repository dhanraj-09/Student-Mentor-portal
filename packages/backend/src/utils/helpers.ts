/** Small request/value helpers shared across routes. */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { FacultyTokenPayload, StudentTokenPayload } from 'shared';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

/**
 * What every service returns. Services stay HTTP-agnostic: they report a
 * domain error code and the route layer maps it to a status code.
 */
export type Result<T, E extends string> =
  { success: true; data: T } | { success: false; code: E; detail?: string };

/**
 * Express 4 does not catch rejected promises from async handlers, so every
 * async route must be wrapped or a thrown error hangs the request.
 */
export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/**
 * Narrows `req.user` to a student payload. The authorization middleware has
 * already guaranteed this, so reaching the throw means a route was mounted
 * without its guard.
 */
export function getStudentUser(req: Request): StudentTokenPayload {
  const user = req.user;
  if (user === undefined || user.type !== 'student') {
    throw new Error('Route requires the student authorization middleware');
  }
  return user;
}

/** Narrows `req.user` to a faculty payload. See `getStudentUser`. */
export function getFacultyUser(req: Request): FacultyTokenPayload {
  const user = req.user;
  if (user === undefined || user.type !== 'faculty') {
    throw new Error('Route requires the faculty authorization middleware');
  }
  return user;
}

/** Treats empty strings as absent, so blank form fields become SQL NULL. */
export function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Coerces numeric form fields (which arrive as strings) to a number or NULL. */
export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}
