/** Student profile reads and writes. */

import type { RowDataPacket } from 'mysql2/promise';
import { mutate, query, queryOne } from '../shared/index.js';

export interface StudentProfileRow extends RowDataPacket {
  registration_no: string;
  name: string;
  degree: string | null;
  branch: string | null;
  year: number | null;
  gender: string | null;
  dob: Date | null;
  linked_in: string | null;
  github: string | null;
  assigned_faculty_email: string | null;
}

/** Editable profile fields. Deliberately excludes `assigned_faculty_email`. */
export interface StudentProfileUpdate {
  name: string | null;
  degree: string | null;
  branch: string | null;
  year: number | null;
  gender: string | null;
  dob: string | null;
  linked_in: string | null;
  github: string | null;
}

const PROFILE_COLUMNS = `registration_no, name, degree, branch, year, gender, dob, linked_in, github, assigned_faculty_email`;

export function findStudentProfile(
  registrationNo: string
): Promise<StudentProfileRow | null> {
  return queryOne<StudentProfileRow>(
    `SELECT ${PROFILE_COLUMNS} FROM student WHERE registration_no = ?`,
    [registrationNo]
  );
}

/**
 * Updates the editable profile fields. `assigned_faculty_email` is intentionally
 * not settable here — mentor assignment is a faculty-only action with its own
 * endpoint, and including it would let a student pick their own mentor.
 */
export async function updateStudentProfile(
  registrationNo: string,
  profile: StudentProfileUpdate
): Promise<number> {
  const result = await mutate(
    `UPDATE student
     SET name = ?, degree = ?, branch = ?, year = ?, gender = ?, dob = ?, linked_in = ?, github = ?
     WHERE registration_no = ?`,
    [
      profile.name,
      profile.degree,
      profile.branch,
      profile.year,
      profile.gender,
      profile.dob,
      profile.linked_in,
      profile.github,
      registrationNo,
    ]
  );
  return result.affectedRows;
}

/** Students with no mentor yet — the pool a faculty can claim from. */
export function findUnassignedStudents(): Promise<StudentProfileRow[]> {
  return query<StudentProfileRow>(
    `SELECT registration_no, name, degree, branch, year, gender, dob, linked_in, github
     FROM student
     WHERE assigned_faculty_email IS NULL
     ORDER BY name ASC`
  );
}

/** Students mentored by a given faculty member. */
export function findStudentsByFaculty(
  facultyEmail: string
): Promise<StudentProfileRow[]> {
  return query<StudentProfileRow>(
    `SELECT ${PROFILE_COLUMNS} FROM student WHERE assigned_faculty_email = ? ORDER BY name`,
    [facultyEmail]
  );
}
