/** Faculty profile reads. */

import type { RowDataPacket } from 'mysql2/promise';
import { queryOne } from '../shared/index.js';

export interface FacultyProfileRow extends RowDataPacket {
  name: string;
  email: string;
  designation: string | null;
  department: string | null;
  phone_number: string | null;
  linked_in: string | null;
  muj_page: string | null;
}

/**
 * Public directory fields only — `password_hash` is never selected, which is
 * what makes this record safe to expose to any authenticated user.
 */
export function findFacultyProfile(
  email: string
): Promise<FacultyProfileRow | null> {
  return queryOne<FacultyProfileRow>(
    `SELECT name, email, designation, department, phone_number, linked_in, muj_page
     FROM faculty
     WHERE email = ?`,
    [email]
  );
}
