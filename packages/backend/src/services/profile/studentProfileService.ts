import {
  findStudentProfile,
  updateStudentProfile as persistStudentProfile,
} from '../../models/profile/index.js';
import type { StudentProfileRow } from '../../models/profile/index.js';
import { toNullableNumber, toNullableString } from '../../utils/helpers.js';
import type { Result } from '../../utils/helpers.js';

export type ProfileErrorCode = 'NOT_FOUND';

export async function getStudentProfile(
  registrationNo: string
): Promise<Result<StudentProfileRow, ProfileErrorCode>> {
  const student = await findStudentProfile(registrationNo);
  if (student === null) {
    return { success: false, code: 'NOT_FOUND' };
  }
  return { success: true, data: student };
}

export async function updateStudentProfile(
  registrationNo: string,
  input: Record<string, unknown>
): Promise<Result<null, ProfileErrorCode>> {
  const affectedRows = await persistStudentProfile(registrationNo, {
    name: toNullableString(input.name),
    degree: toNullableString(input.degree),
    branch: toNullableString(input.branch),
    year: toNullableNumber(input.year),
    gender: toNullableString(input.gender),
    dob: toNullableString(input.dob),
    linked_in: toNullableString(input.linked_in),
    github: toNullableString(input.github),
  });

  if (affectedRows === 0) {
    return { success: false, code: 'NOT_FOUND' };
  }
  return { success: true, data: null };
}
