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
  getDeviceKey,
  getKeyState,
  getMeetingDetail,
  issueRoomToken,
  listParticipantKeys,
  listSkillOptions,
  publishEnvelopes,
  registerDeviceKey,
  requestKey,
  setReadiness,
} from '../../services/meetings/index.js';
import type { VideoRoomErrorCode } from '../../services/meetings/index.js';
import { asyncHandler } from '../../utils/helpers.js';

const errorResponses: Record<
  VideoRoomErrorCode,
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
  LIVEKIT_UNAVAILABLE: {
    status: 503,
    message: 'The video service is not available right now',
  },
  FACULTY_ONLY: {
    status: 403,
    message: 'Only the mentor can do that',
  },
  INVALID_KEY_MATERIAL: {
    status: 400,
    message: 'The encryption key material is malformed',
  },
  E2EE_DEVICE_KEY_MISSING: {
    status: 409,
    message: 'This browser has not registered an encryption key yet',
  },
  E2EE_KEY_UNAVAILABLE: {
    status: 409,
    message: 'No encryption key has been shared with you for this meeting yet',
  },
  E2EE_STALE_DEVICE_KEY: {
    status: 409,
    message:
      'The encryption key was shared with a different device. Request access again from this browser',
  },
  E2EE_VERSION_CONFLICT: {
    status: 409,
    message: 'The meeting encryption key has moved on; reload and try again',
  },
  E2EE_ROTATION_INCOMPLETE: {
    status: 400,
    message: 'A new key must be sealed for every participant',
  },
};

export function sendMeetingError(
  res: Response,
  code: VideoRoomErrorCode,
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

/* -------------------------------------------------------------------------- */
/* Video call                                                                  */
/*                                                                             */
/* These are declared before `/meetings/:meeting_id` so the catch-all does not  */
/* swallow the static segments.                                                */
/* -------------------------------------------------------------------------- */

/** Registers the public half of this browser's encryption key pair. */
router.post(
  '/meetings/e2ee/device-key',
  authenticated,
  asyncHandler(async (req, res) => {
    const result = await registerDeviceKey(req.user!, req.body?.public_key);

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(201).json(result.data);
  })
);

router.get(
  '/meetings/e2ee/device-key',
  authenticated,
  asyncHandler(async (req, res) => {
    res.status(200).json(await getDeviceKey(req.user!));
  })
);

/** Public keys of both participants, so a member can seal the room key. */
router.get(
  '/meetings/:meeting_id/room/participant-keys',
  authenticated,
  asyncHandler(async (req, res) => {
    const result = await listParticipantKeys(req.user!, req.params.meeting_id);

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(200).json(result.data);
  })
);

/** Current key generation, this browser's sealed envelope, pending requests. */
router.get(
  '/meetings/:meeting_id/room/keys',
  authenticated,
  asyncHandler(async (req, res) => {
    const result = await getKeyState(req.user!, req.params.meeting_id);

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(200).json(result.data);
  })
);

/** Publishes sealed envelopes (first key, serving a request, or a rotation). */
router.post(
  '/meetings/:meeting_id/room/keys',
  authenticated,
  asyncHandler(async (req, res) => {
    const result = await publishEnvelopes(
      req.user!,
      req.params.meeting_id,
      req.body?.key_version,
      req.body?.envelopes
    );

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(201).json(result.data);
  })
);

/** Asks the other participant to seal the room key for this browser. */
router.post(
  '/meetings/:meeting_id/room/key-requests',
  authenticated,
  asyncHandler(async (req, res) => {
    const result = await requestKey(req.user!, req.params.meeting_id);

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(202).json({ message: 'Key requested' });
  })
);

/**
 * The only place a LiveKit token is minted. Requires authentication,
 * participation, an ongoing meeting and a usable end-to-end encryption key.
 */
router.post(
  '/meetings/:meeting_id/room/token',
  authenticated,
  asyncHandler(async (req, res) => {
    const result = await issueRoomToken(req.user!, req.params.meeting_id);

    if (!result.success) {
      sendMeetingError(res, result.code, result.detail);
      return;
    }

    res.status(200).json(result.data);
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
