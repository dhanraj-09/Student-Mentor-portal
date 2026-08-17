import type { RequestHandler } from 'express';
import { authenticate } from './authentication.js';
import { requireFaculty, requireStudent } from './authorization.js';

const requireStudentSelf: RequestHandler = (req, res, next) => {
  const user = req.user;
  if (
    user?.type !== 'student' ||
    user.registration_no !== req.params.registration_no
  ) {
    res.status(403).json({ error: 'You can only access your own data' });
    return;
  }
  next();
};

const requireFacultySelf: RequestHandler = (req, res, next) => {
  const user = req.user;
  if (user?.type !== 'faculty' || user.email !== req.params.email) {
    res.status(403).json({ error: 'You can only access your own data' });
    return;
  }
  next();
};

export const studentOwnership: RequestHandler[] = [
  authenticate,
  requireStudent,
  requireStudentSelf,
];

export const facultyOwnership: RequestHandler[] = [
  authenticate,
  requireFaculty,
  requireFacultySelf,
];
