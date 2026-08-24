import { Router } from 'express';
import { facultyOnly } from '../../middleware/auth/authorization.js';
import { getFacultyDashboard } from '../../services/dashboard/index.js';
import { asyncHandler, getFacultyUser } from '../../utils/helpers.js';

const router = Router();

router.get(
  '/dashboard/faculty',
  facultyOnly,
  asyncHandler(async (req, res) => {
    const faculty = getFacultyUser(req);
    const result = await getFacultyDashboard(faculty.email);

    if (!result.success) {
      res.status(404).json({ error: 'Faculty not found' });
      return;
    }

    res.status(200).json(result.data);
  })
);

export default router;
