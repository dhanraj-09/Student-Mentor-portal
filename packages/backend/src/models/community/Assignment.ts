import { mutate } from '../shared/index.js';

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
