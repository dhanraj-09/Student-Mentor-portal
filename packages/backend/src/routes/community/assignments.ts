/**
 * Mentor assignment routes.
 *
 * `/student/unassigned` and `/faculty/get-student` are literal paths that would
 * otherwise be captured by the `/student/:registration_no` and `/faculty/:email`
 * routes in the profile router — which is why the profile router is mounted last.
 */

import { Router } from 'express';
import { facultyOnly } from '../../middleware/auth/authorization.js';
import {
  assignStudent,
  listAssignedStudents,
  listUnassignedStudents,
} from '../../services/community/index.js';
import type { AssignmentErrorCode } from '../../services/community/index.js';
import { asyncHandler, getFacultyUser } from '../../utils/helpers.js';

const router = Router();

const errorResponses: Record<
  AssignmentErrorCode,
  { status: number; message: string }
> = {
  SELF_ONLY: {
    status: 403,
    message: 'You can only assign students to yourself',
  },
  STUDENT_NOT_FOUND: { status: 404, message: 'Student not found' },
  MISSING_STUDENT: { status: 400, message: 'registration_no is required' },
};

router.get(
  '/student/unassigned',
  facultyOnly,
  asyncHandler(async (_req, res) => {
    res.status(200).json(await listUnassignedStudents());
  })
);

router.get(
  '/faculty/get-student',
  facultyOnly,
  asyncHandler(async (req, res) => {
    // The faculty email comes from the JWT, never a query parameter.
    const faculty = getFacultyUser(req);
    res.status(200).json(await listAssignedStudents(faculty.email));
  })
);

router.put(
  '/faculty/assign-student',
  facultyOnly,
  asyncHandler(async (req, res) => {
    const faculty = getFacultyUser(req);
    const result = await assignStudent(
      faculty.email,
      req.body?.registration_no,
      req.body?.email
    );

    if (!result.success) {
      const { status, message } = errorResponses[result.code];
      res.status(status).json({ error: message });
      return;
    }

    res.status(200).json({ message: 'Student assigned successfully' });
  })
);

export default router;
