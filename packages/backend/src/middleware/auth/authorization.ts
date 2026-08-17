/**
 * Role gates. Each runs after `authenticate`, so the composed `studentOnly` /
 * `facultyOnly` arrays below are what routes actually mount.
 */

import type { RequestHandler } from 'express';
import { authenticate } from './authentication.js';

export const requireStudent: RequestHandler = (req, res, next) => {
  if (req.user?.type !== 'student') {
    res.status(403).json({ error: 'Student access required' });
    return;
  }
  next();
};

export const requireFaculty: RequestHandler = (req, res, next) => {
  if (req.user?.type !== 'faculty') {
    res.status(403).json({ error: 'Faculty access required' });
    return;
  }
  next();
};

/** Any authenticated user, regardless of role. */
export const authenticated: RequestHandler[] = [authenticate];

export const studentOnly: RequestHandler[] = [authenticate, requireStudent];

export const facultyOnly: RequestHandler[] = [authenticate, requireFaculty];
