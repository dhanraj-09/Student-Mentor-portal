import { Router } from 'express';
import { studentOwnership } from '../../middleware/auth/ownership.js';
import {
  getStudentProfile,
  updateStudentProfile,
} from '../../services/profile/index.js';
import { asyncHandler } from '../../utils/helpers.js';

const router = Router();

router.get(
  '/student/:registration_no',
  studentOwnership,
  asyncHandler(async (req, res) => {
    const result = await getStudentProfile(req.params.registration_no);
    if (!result.success) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    res.status(200).json(result.data);
  })
);

router.put(
  '/student/:registration_no',
  studentOwnership,
  asyncHandler(async (req, res) => {
    const result = await updateStudentProfile(
      req.params.registration_no,
      req.body ?? {}
    );
    if (!result.success) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    res.status(200).json({ message: 'Student data updated successfully' });
  })
);

export default router;
