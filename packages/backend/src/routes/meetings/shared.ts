/**
 * Meeting routes available to both roles.
 *
 * `/meetings/:meeting_id` is a catch-all, so this router must be mounted after
 * the student and faculty meeting routers (see routes/meetings/index.ts).
 */

import { Router } from 'express';
import type { Response } from 'express';
import { authenticated } from '../../middleware/auth/authorization.js';
import {
  getMeetingDetail,
  listSkillOptions,
  setReadiness,
} from '../../services/meetings/index.js';
import type { MeetingErrorCode } from '../../services/meetings/index.js';
import { asyncHandler } from '../../utils/helpers.js';

const errorResponses: Record<
  MeetingErrorCode,
  { status: number; message: string }
> = {
  SELF_ONLY: {
    status: 403,
    message: 'You can only request meetings for yourself',
  },
  REASON_REQUIRED: {
    status: 400,
    message: 'A reason for the meeting is required',
  },
  STUDENT_NOT_FOUND: { status: 404, message: 'Student not found' },
  NO_MENTOR: { status: 400, message: 'You do not have an assigned mentor yet' },
  MISSING_STUDENT: { status: 400, message: 'student_id is required' },
  NOT_ASSIGNED: { status: 403, message: 'This student is not assigned to you' },
  NOT_FOUND: { status: 404, message: 'Meeting not found' },
  NOT_OWNED: { status: 403, message: 'Meeting not found or not yours' },
  NOT_PARTICIPANT: { status: 403, message: 'Not authorized for this meeting' },
  INVALID_STATE: {
    status: 400,
    message: 'The meeting is not in the required state',
  },
  INVALID_MARKS: {
    status: 400,
    message: 'Marks must be an integer between 0 and 30',
  },
  NO_SKILLS: { status: 400, message: 'Select at least one skill discussed' },
};

export function sendMeetingError(
  res: Response,
  code: MeetingErrorCode,
  detail?: string
): void {
  const { status, message } = errorResponses[code];
  res.status(status).json({ error: detail ?? message });
}

const router = Router();

router.get(
  '/meeting-skill-options',
  authenticated,
  asyncHandler(async (_req, res) => {
    res.status(200).json(await listSkillOptions());
  })
);

router.put(
  '/meetings/:meeting_id/ready',
  authenticated,
  asyncHandler(async (req, res) => {
    const ready = req.body?.ready !== false;
    const result = await setReadiness(req.user!, req.params.meeting_id, ready);

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(200).json({
      message: result.data.ready ? 'Marked ready' : 'Marked not ready',
    });
  })
);

router.get(
  '/meetings/:meeting_id',
  authenticated,
  asyncHandler(async (req, res) => {
    const result = await getMeetingDetail(req.user!, req.params.meeting_id);

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(200).json(result.data);
  })
);

export default router;
