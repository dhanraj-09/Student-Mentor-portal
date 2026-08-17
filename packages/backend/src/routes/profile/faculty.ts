/**
 * Faculty profile route.
 *
 * Readable by any authenticated user rather than the faculty member alone: a
 * student needs to display their assigned mentor's details. Only public
 * directory columns are selected, so nothing sensitive is exposed.
 */

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
