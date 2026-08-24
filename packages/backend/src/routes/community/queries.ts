import { Router } from 'express';
import {
  studentOnly,
  facultyOnly,
} from '../../middleware/auth/authorization.js';
import {
  facultyOwnership,
  studentOwnership,
} from '../../middleware/auth/ownership.js';
import {
  createQuery,
  listFacultyQueries,
  listStudentQueries,
  respondToQuery,
} from '../../services/community/index.js';
import type { QueryErrorCode } from '../../services/community/index.js';
import {
  asyncHandler,
  getFacultyUser,
  getStudentUser,
} from '../../utils/helpers.js';
import { parsePageRequest, toPage } from '../../utils/pagination.js';

const router = Router();

const errorResponses: Record<
  QueryErrorCode,
  { status: number; message: string }
> = {
  SELF_ONLY: {
    status: 403,
    message: 'You can only create queries for yourself',
  },
  MISSING_FIELDS: { status: 400, message: 'All query fields are required' },
  INVALID_STATUS: {
    status: 400,
    message: 'Status must be Pending or Resolved',
  },
  NOT_OWNED: {
    status: 403,
    message: "You can only respond to your own students' queries",
  },
};

router.get(
  '/student/:registration_no/queries',
  studentOwnership,
  asyncHandler(async (req, res) => {
    const page = parsePageRequest(req.query);
    const rows = await listStudentQueries(req.params.registration_no, page);
    res.status(200).json(toPage(rows, page));
  })
);

router.get(
  '/faculty/:email/queries',
  facultyOwnership,
  asyncHandler(async (req, res) => {
    const page = parsePageRequest(req.query);
    const rows = await listFacultyQueries(req.params.email, page);
    res.status(200).json(toPage(rows, page));
  })
);

router.post(
  '/queries',
  studentOnly,
  asyncHandler(async (req, res) => {
    const student = getStudentUser(req);
    const result = await createQuery(student.registration_no, req.body ?? {});

    if (!result.success) {
      const { status, message } = errorResponses[result.code];
      res.status(status).json({ error: message });
      return;
    }

    res.status(201).json({
      message: 'Query created successfully',
      queryId: result.data.queryId,
    });
  })
);

router.put(
  '/queries/:query_id/respond',
  facultyOnly,
  asyncHandler(async (req, res) => {
    const faculty = getFacultyUser(req);
    const result = await respondToQuery(
      faculty.email,
      req.params.query_id,
      req.body ?? {}
    );

    if (!result.success) {
      const { status, message } = errorResponses[result.code];
      res.status(status).json({ error: message });
      return;
    }

    res.status(200).json({ message: 'Query updated successfully' });
  })
);

export default router;
