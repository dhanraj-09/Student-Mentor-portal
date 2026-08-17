/** Mentor assignment writes. Reads live in the profile model. */

import { mutate } from '../shared/index.js';

/**
 * Claims a student as a mentee. Returns the number of rows changed so the
 * caller can tell a missing student from a successful assignment.
 */
export async function assignStudentToFaculty(
  registrationNo: string,
  facultyEmail: string
): Promise<number> {
  const result = await mutate(
    `UPDATE student SET assigned_faculty_email = ? WHERE registration_no = ?`,
    [facultyEmail, registrationNo]
  );
  return result.affectedRows;
}
