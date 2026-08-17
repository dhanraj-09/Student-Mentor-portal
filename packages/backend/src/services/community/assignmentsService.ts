/** Mentor assignment logic. */

import { assignStudentToFaculty } from '../../models/community/index.js';
import {
  findStudentsByFaculty,
  findUnassignedStudents,
} from '../../models/profile/index.js';
import type { StudentProfileRow } from '../../models/profile/index.js';
import { toNullableString } from '../../utils/helpers.js';
import type { Result } from '../../utils/helpers.js';

export type AssignmentErrorCode =
  'SELF_ONLY' | 'STUDENT_NOT_FOUND' | 'MISSING_STUDENT';

export function listUnassignedStudents(): Promise<StudentProfileRow[]> {
  return findUnassignedStudents();
}

export function listAssignedStudents(
  facultyEmail: string
): Promise<StudentProfileRow[]> {
  return findStudentsByFaculty(facultyEmail);
}

/**
 * Assigns a student to the requesting faculty member.
 *
 * `targetEmail` comes from the request body; it must match the email in the
 * JWT so a faculty member cannot assign mentees to a colleague.
 */
export async function assignStudent(
  facultyEmail: string,
  registrationNoInput: unknown,
  targetEmailInput: unknown
): Promise<Result<null, AssignmentErrorCode>> {
  const registrationNo = toNullableString(registrationNoInput);
  const targetEmail = toNullableString(targetEmailInput);

  if (registrationNo === null) {
    return { success: false, code: 'MISSING_STUDENT' };
  }
  if (targetEmail !== null && targetEmail !== facultyEmail) {
    return { success: false, code: 'SELF_ONLY' };
  }

  const affectedRows = await assignStudentToFaculty(
    registrationNo,
    facultyEmail
  );
  if (affectedRows === 0) {
    return { success: false, code: 'STUDENT_NOT_FOUND' };
  }

  return { success: true, data: null };
}
