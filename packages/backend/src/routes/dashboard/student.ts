import { Router } from 'express';
import { studentOnly } from '../../middleware/auth/authorization.js';
import { getStudentDashboard } from '../../services/dashboard/index.js';
import { asyncHandler, getStudentUser } from '../../utils/helpers.js';

const router = Router();

// The registration number comes from the token, not the path, so there is no
// ownership check to get wrong here.
router.get(
  '/dashboard/student',
  studentOnly,
  asyncHandler(async (req, res) => {
    const student = getStudentUser(req);
    const result = await getStudentDashboard(student.registration_no);

    if (!result.success) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }

    res.status(200).json(result.data);
  })
);

export default router;
