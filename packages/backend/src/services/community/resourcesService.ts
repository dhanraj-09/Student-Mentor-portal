import {
  RESOURCE_TITLE_MAX_LENGTH,
  RESOURCE_URL_MAX_LENGTH,
  isSafeHttpUrl,
} from 'shared';
import {
  deleteResource as removeResource,
  findResourcesByFaculty,
  findResourcesForStudent,
  insertResource,
  updateResource as persistResource,
} from '../../models/community/index.js';
import type { ResourceRow } from '../../models/community/index.js';
import { toNullableString } from '../../utils/helpers.js';
import type { Result } from '../../utils/helpers.js';
import type { PageRequest } from '../../utils/pagination.js';

export type ResourceErrorCode =
  | 'MISSING_TITLE'
  | 'TITLE_TOO_LONG'
  | 'INVALID_URL'
  | 'URL_TOO_LONG'
  | 'NOT_OWNED';

interface ValidatedResource {
  title: string;
  description: string | null;
  url: string | null;
  category: string | null;
}

function validate(
  input: Record<string, unknown>
): Result<ValidatedResource, ResourceErrorCode> {
  const title = toNullableString(input.title);
  if (title === null) {
    return { success: false, code: 'MISSING_TITLE' };
  }
  if (title.length > RESOURCE_TITLE_MAX_LENGTH) {
    return { success: false, code: 'TITLE_TOO_LONG' };
  }

  // A url is optional — a resource can be a plain note — but once supplied it
  // has to be a link a browser can safely follow.
  const url = toNullableString(input.url);
  if (url !== null) {
    if (!isSafeHttpUrl(url)) {
      return { success: false, code: 'INVALID_URL' };
    }
    if (url.length > RESOURCE_URL_MAX_LENGTH) {
      return { success: false, code: 'URL_TOO_LONG' };
    }
  }

  return {
    success: true,
    data: {
      title,
      description: toNullableString(input.description),
      url,
      category: toNullableString(input.category),
    },
  };
}

export function listFacultyResources(
  facultyEmail: string,
  page?: PageRequest
): Promise<ResourceRow[]> {
  return findResourcesByFaculty(
    facultyEmail,
    page === undefined ? undefined : page.limit + 1,
    page?.offset
  );
}

export function listStudentResources(
  registrationNo: string,
  page?: PageRequest
): Promise<ResourceRow[]> {
  return findResourcesForStudent(
    registrationNo,
    page === undefined ? undefined : page.limit + 1,
    page?.offset
  );
}

export async function createResource(
  facultyEmail: string,
  input: Record<string, unknown>
): Promise<Result<{ resourceId: number }, ResourceErrorCode>> {
  const validated = validate(input);
  if (!validated.success) return validated;

  const resourceId = await insertResource({
    faculty_email: facultyEmail,
    ...validated.data,
  });

  return { success: true, data: { resourceId } };
}

export async function updateResource(
  facultyEmail: string,
  resourceId: string,
  input: Record<string, unknown>
): Promise<Result<null, ResourceErrorCode>> {
  const validated = validate(input);
  if (!validated.success) return validated;

  // The faculty email is part of the WHERE clause, so a resource belonging to
  // someone else is indistinguishable from one that does not exist.
  const affectedRows = await persistResource(
    resourceId,
    facultyEmail,
    validated.data
  );

  if (affectedRows === 0) {
    return { success: false, code: 'NOT_OWNED' };
  }
  return { success: true, data: null };
}

export async function deleteResource(
  facultyEmail: string,
  resourceId: string
): Promise<Result<null, ResourceErrorCode>> {
  const affectedRows = await removeResource(resourceId, facultyEmail);
  if (affectedRows === 0) {
    return { success: false, code: 'NOT_OWNED' };
  }
  return { success: true, data: null };
}
