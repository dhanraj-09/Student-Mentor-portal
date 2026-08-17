import { isNonEmptyString, isQueryStatus } from 'shared';
import type { QueryStatus } from 'shared';
import {
  findQueriesByFaculty,
  findQueriesByStudent,
  findQueryOwnedByFaculty,
  insertQuery,
  updateQueryResponse,
} from '../../models/community/index.js';
import type { QueryRow } from '../../models/community/index.js';
import { toNullableString } from '../../utils/helpers.js';
import type { Result } from '../../utils/helpers.js';

export type QueryErrorCode =
  'SELF_ONLY' | 'MISSING_FIELDS' | 'INVALID_STATUS' | 'NOT_OWNED';

export function listStudentQueries(
  registrationNo: string
): Promise<QueryRow[]> {
  return findQueriesByStudent(registrationNo);
}

export function listFacultyQueries(facultyEmail: string): Promise<QueryRow[]> {
  return findQueriesByFaculty(facultyEmail);
}

export async function createQuery(
  studentRegistrationNo: string,
  input: Record<string, unknown>
): Promise<Result<{ queryId: number }, QueryErrorCode>> {
  const studentId = toNullableString(input.student_id);

  if (studentId !== null && studentId !== studentRegistrationNo) {
    return { success: false, code: 'SELF_ONLY' };
  }

  const category = toNullableString(input.category);
  const subcategory = toNullableString(input.subcategory);
  const subject = toNullableString(input.subject);
  const description = toNullableString(input.description);

  if (
    category === null ||
    subcategory === null ||
    subject === null ||
    description === null
  ) {
    return { success: false, code: 'MISSING_FIELDS' };
  }

  const queryId = await insertQuery({
    student_id: studentRegistrationNo,
    category,
    subcategory,
    subject,
    description,
  });

  return { success: true, data: { queryId } };
}

export async function respondToQuery(
  facultyEmail: string,
  queryId: string,
  input: Record<string, unknown>
): Promise<Result<null, QueryErrorCode>> {
  const statusInput = input.status;
  const status: QueryStatus =
    statusInput === undefined ? 'Resolved' : (statusInput as QueryStatus);

  if (!isQueryStatus(status)) {
    return { success: false, code: 'INVALID_STATUS' };
  }

  const owned = await findQueryOwnedByFaculty(queryId, facultyEmail);
  if (owned === null) {
    return { success: false, code: 'NOT_OWNED' };
  }

  const response = isNonEmptyString(input.response) ? input.response : null;
  await updateQueryResponse(queryId, response, status);

  return { success: true, data: null };
}
