/** Faculty profile logic. */

import { findFacultyProfile } from '../../models/profile/index.js';
import type { FacultyProfileRow } from '../../models/profile/index.js';
import type { Result } from '../../utils/helpers.js';
import type { ProfileErrorCode } from './studentProfileService.js';

export async function getFacultyProfile(
  email: string
): Promise<Result<FacultyProfileRow, ProfileErrorCode>> {
  const faculty = await findFacultyProfile(email);
  if (faculty === null) {
    return { success: false, code: 'NOT_FOUND' };
  }
  return { success: true, data: faculty };
}
