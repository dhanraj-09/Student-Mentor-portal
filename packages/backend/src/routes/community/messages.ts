import { Router } from 'express';
import {
  authenticated,
  facultyOnly,
  studentOnly,
} from '../../middleware/auth/authorization.js';
import { facultyOwnership } from '../../middleware/auth/ownership.js';
import {
  getFacultyThread,
  getStudentThread,
  listFacultyThreads,
  markRead,
  sendMessage,
} from '../../services/community/index.js';
import type { MessageErrorCode } from '../../services/community/index.js';
import {
  asyncHandler,
  getFacultyUser,
  getStudentUser,
} from '../../utils/helpers.js';
import { parsePageRequest, toPage } from '../../utils/pagination.js';

const router = Router();

const errorResponses: Record<
  MessageErrorCode,
  { status: number; message: string }
> = {
  EMPTY_MESSAGE: { status: 400, message: 'A message cannot be empty' },
  TOO_LONG: {
    status: 400,
    message: 'That message is too long (4000 characters maximum)',
  },
  NO_MENTOR: { status: 400, message: 'You do not have an assigned mentor yet' },
  STUDENT_NOT_FOUND: { status: 404, message: 'Student not found' },
  NOT_ASSIGNED: { status: 403, message: 'This student is not assigned to you' },
};

function fail(
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  code: MessageErrorCode
): void {
  const { status, message } = errorResponses[code];
  res.status(status).json({ error: message });
}

/**
 * The student's single conversation. There is no thread identifier: a student
 * has exactly one mentor, and the server resolves it from their own record.
 */
router.get(
  '/messages/student',
  studentOnly,
  asyncHandler(async (req, res) => {
    const student = getStudentUser(req);
    const page = parsePageRequest(req.query);
    const result = await getStudentThread(student.registration_no, page);

    if (!result.success) {
      fail(res, result.code);
      return;
    }

    res.status(200).json({
      ...toPage(result.data.messages, page),
      unread: result.data.unread,
    });
  })
);

/** A mentor's conversation list, including students who have never written. */
router.get(
  '/faculty/:email/messages',
  facultyOwnership,
  asyncHandler(async (req, res) => {
    res.status(200).json(await listFacultyThreads(req.params.email));
  })
);

/** One conversation from the mentor's side. */
router.get(
  '/messages/faculty/:registration_no',
  facultyOnly,
  asyncHandler(async (req, res) => {
    const faculty = getFacultyUser(req);
    const page = parsePageRequest(req.query);
    const result = await getFacultyThread(
      faculty.email,
      req.params.registration_no,
      page
    );

    if (!result.success) {
      fail(res, result.code);
      return;
    }

    res.status(200).json({
      ...toPage(result.data.messages, page),
      unread: result.data.unread,
    });
  })
);

router.post(
  '/messages',
  authenticated,
  asyncHandler(async (req, res) => {
    const result = await sendMessage(req.user!, req.body ?? {});

    if (!result.success) {
      fail(res, result.code);
      return;
    }

    res.status(201).json({
      message: 'Message sent',
      messageId: result.data.messageId,
    });
  })
);

router.put(
  '/messages/read',
  authenticated,
  asyncHandler(async (req, res) => {
    const result = await markRead(
      req.user!,
      typeof req.body?.student_id === 'string' ? req.body.student_id : undefined
    );

    if (!result.success) {
      fail(res, result.code);
      return;
    }

    res.status(200).json({ message: 'Marked as read', ...result.data });
  })
);

export default router;
