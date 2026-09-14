import { Router } from 'express';
import { facultyOnly } from '../../middleware/auth/authorization.js';
import {
  facultyOwnership,
  studentOwnership,
} from '../../middleware/auth/ownership.js';
import {
  createResource,
  deleteResource,
  listFacultyResources,
  listStudentResources,
  updateResource,
} from '../../services/community/index.js';
import type { ResourceErrorCode } from '../../services/community/index.js';
import { asyncHandler, getFacultyUser } from '../../utils/helpers.js';
import { parsePageRequest, toPage } from '../../utils/pagination.js';

const router = Router();

const errorResponses: Record<
  ResourceErrorCode,
  { status: number; message: string }
> = {
  MISSING_TITLE: { status: 400, message: 'A resource title is required' },
  TITLE_TOO_LONG: {
    status: 400,
    message: 'The title is too long (255 characters maximum)',
  },
  INVALID_URL: {
    status: 400,
    message: 'The link must be a valid http or https URL',
  },
  URL_TOO_LONG: {
    status: 400,
    message: 'The link is too long (1024 characters maximum)',
  },
  NOT_OWNED: { status: 404, message: 'Resource not found or not yours' },
};

router.get(
  '/faculty/:email/resources',
  facultyOwnership,
  asyncHandler(async (req, res) => {
    const page = parsePageRequest(req.query);
    const rows = await listFacultyResources(req.params.email, page);
    res.status(200).json(toPage(rows, page));
  })
);

router.get(
  '/student/:registration_no/resources',
  studentOwnership,
  asyncHandler(async (req, res) => {
    const page = parsePageRequest(req.query);
    const rows = await listStudentResources(req.params.registration_no, page);
    res.status(200).json(toPage(rows, page));
  })
);

router.post(
  '/resources',
  facultyOnly,
  asyncHandler(async (req, res) => {
    const faculty = getFacultyUser(req);
    const result = await createResource(faculty.email, req.body ?? {});

    if (!result.success) {
      const { status, message } = errorResponses[result.code];
      res.status(status).json({ error: message });
      return;
    }

    res.status(201).json({
      message: 'Resource created successfully',
      resourceId: result.data.resourceId,
    });
  })
);

router.put(
  '/resources/:resource_id',
  facultyOnly,
  asyncHandler(async (req, res) => {
    const faculty = getFacultyUser(req);
    const result = await updateResource(
      faculty.email,
      req.params.resource_id,
      req.body ?? {}
    );

    if (!result.success) {
      const { status, message } = errorResponses[result.code];
      res.status(status).json({ error: message });
      return;
    }

    res.status(200).json({ message: 'Resource updated successfully' });
  })
);

router.delete(
  '/resources/:resource_id',
  facultyOnly,
  asyncHandler(async (req, res) => {
    const faculty = getFacultyUser(req);
    const result = await deleteResource(faculty.email, req.params.resource_id);

    if (!result.success) {
      const { status, message } = errorResponses[result.code];
      res.status(status).json({ error: message });
      return;
    }

    res.status(200).json({ message: 'Resource deleted successfully' });
  })
);

export default router;
