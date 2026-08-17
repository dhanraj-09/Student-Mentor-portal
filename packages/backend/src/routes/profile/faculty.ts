import { Router } from 'express';
import { authenticated } from '../../middleware/auth/authorization.js';
import { getFacultyProfile } from '../../services/profile/index.js';
import { asyncHandler } from '../../utils/helpers.js';

const router = Router();

router.get(
  '/faculty/:email',
  authenticated,
  asyncHandler(async (req, res) => {
    const result = await getFacultyProfile(req.params.email);
    if (!result.success) {
      res.status(404).json({ error: 'Faculty member not found' });
      return;
    }
    res.status(200).json(result.data);
  })
);

export default router;
