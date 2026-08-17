import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { FacultyTokenPayload, StudentTokenPayload } from 'shared';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export type Result<T, E extends string> =
  { success: true; data: T } | { success: false; code: E; detail?: string };

export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export function getStudentUser(req: Request): StudentTokenPayload {
  const user = req.user;
  if (user === undefined || user.type !== 'student') {
    throw new Error('Route requires the student authorization middleware');
  }
  return user;
}

export function getFacultyUser(req: Request): FacultyTokenPayload {
  const user = req.user;
  if (user === undefined || user.type !== 'faculty') {
    throw new Error('Route requires the faculty authorization middleware');
  }
  return user;
}

export function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}
