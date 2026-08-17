/** Student-facing meeting routes. */

import { Router } from 'express';
import { studentOnly } from '../../middleware/auth/authorization.js';
import { studentOwnership } from '../../middleware/auth/ownership.js';
import {
  listStudentMeetings,
  requestMeeting,
} from '../../services/meetings/index.js';
import { asyncHandler, getStudentUser } from '../../utils/helpers.js';
import { sendMeetingError } from './shared.js';

const router = Router();

router.post(
  '/meetings/request',
  studentOnly,
  asyncHandler(async (req, res) => {
    const student = getStudentUser(req);
    const result = await requestMeeting(
      student.registration_no,
      req.body ?? {}
    );

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(201).json({
      message: 'Meeting requested successfully',
      meetingId: result.data.meetingId,
    });
  })
);

router.get(
  '/student/:registration_no/meetings',
  studentOwnership,
  asyncHandler(async (req, res) => {
    res.status(200).json(await listStudentMeetings(req.params.registration_no));
  })
);

export default router;
