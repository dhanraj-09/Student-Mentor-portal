/** Faculty-facing meeting routes — creation and the lifecycle transitions. */

import { Router } from 'express';
import { facultyOnly } from '../../middleware/auth/authorization.js';
import {
  acceptMeeting,
  completeMeeting,
  createMeeting,
  listFacultyMeetings,
  startMeeting,
} from '../../services/meetings/index.js';
import { asyncHandler, getFacultyUser } from '../../utils/helpers.js';
import { sendMeetingError } from './shared.js';

const router = Router();

router.get(
  '/faculty/meetings',
  facultyOnly,
  asyncHandler(async (req, res) => {
    const faculty = getFacultyUser(req);
    res.status(200).json(await listFacultyMeetings(faculty.email));
  })
);

router.post(
  '/meetings/create',
  facultyOnly,
  asyncHandler(async (req, res) => {
    const faculty = getFacultyUser(req);
    const result = await createMeeting(faculty.email, req.body ?? {});

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(201).json({
      message: 'Meeting created successfully',
      meetingId: result.data.meetingId,
    });
  })
);

router.put(
  '/meetings/:meeting_id/accept',
  facultyOnly,
  asyncHandler(async (req, res) => {
    const faculty = getFacultyUser(req);
    const result = await acceptMeeting(faculty.email, req.params.meeting_id);

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(200).json({ message: 'Meeting accepted' });
  })
);

router.put(
  '/meetings/:meeting_id/start',
  facultyOnly,
  asyncHandler(async (req, res) => {
    const faculty = getFacultyUser(req);
    const result = await startMeeting(faculty.email, req.params.meeting_id);

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(200).json({ message: 'Meeting started' });
  })
);

router.put(
  '/meetings/:meeting_id/complete',
  facultyOnly,
  asyncHandler(async (req, res) => {
    const faculty = getFacultyUser(req);
    const result = await completeMeeting(
      faculty.email,
      req.params.meeting_id,
      req.body ?? {}
    );

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(200).json({ message: 'Meeting completed successfully' });
  })
);

export default router;
