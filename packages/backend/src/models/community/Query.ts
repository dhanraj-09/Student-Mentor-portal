/** Student queries: creation, listing, and faculty responses. */

import type { RowDataPacket } from 'mysql2/promise';
import type { QueryStatus } from 'shared';
import { mutate, query, queryOne } from '../shared/index.js';

export interface QueryRow extends RowDataPacket {
  query_id: number;
  student_id: string;
  category: string;
  subcategory: string;
  subject: string;
  description: string;
  status: QueryStatus;
  created_at: Date;
  response?: string | null;
  responded_at?: Date | null;
}

export interface NewQuery {
  student_id: string;
  category: string;
  subcategory: string;
  subject: string;
  description: string;
}

/** A student's own queries — the response columns are included so they can read replies. */
export function findQueriesByStudent(
  registrationNo: string
): Promise<QueryRow[]> {
  return query<QueryRow>(
    `SELECT query_id, student_id, category, subcategory, subject, description, status, created_at, response, responded_at
     FROM queries
     WHERE student_id = ?
     ORDER BY created_at DESC`,
    [registrationNo]
  );
}

/** Every query raised by the students a faculty member mentors. */
export function findQueriesByFaculty(
  facultyEmail: string
): Promise<QueryRow[]> {
  return query<QueryRow>(
    `SELECT q.query_id, q.student_id, q.category, q.subcategory, q.subject, q.description,
            q.status, q.created_at, q.response, q.responded_at
     FROM queries q
     JOIN student s ON q.student_id = s.registration_no
     WHERE s.assigned_faculty_email = ?
     ORDER BY q.created_at DESC`,
    [facultyEmail]
  );
}

export async function insertQuery(newQuery: NewQuery): Promise<number> {
  const result = await mutate(
    `INSERT INTO queries(student_id, category, subcategory, subject, description)
     VALUES (?, ?, ?, ?, ?)`,
    [
      newQuery.student_id,
      newQuery.category,
      newQuery.subcategory,
      newQuery.subject,
      newQuery.description,
    ]
  );
  return result.insertId;
}

/**
 * Confirms the query belongs to one of the faculty's own mentees. Returns null
 * when it does not, which the service treats as forbidden.
 */
export function findQueryOwnedByFaculty(
  queryId: string,
  facultyEmail: string
): Promise<QueryRow | null> {
  return queryOne<QueryRow>(
    `SELECT q.query_id
     FROM queries q
     JOIN student s ON q.student_id = s.registration_no
     WHERE q.query_id = ? AND s.assigned_faculty_email = ?`,
    [queryId, facultyEmail]
  );
}

export async function updateQueryResponse(
  queryId: string,
  response: string | null,
  status: QueryStatus
): Promise<void> {
  await mutate(
    `UPDATE queries SET response = ?, status = ?, responded_at = NOW() WHERE query_id = ?`,
    [response, status, queryId]
  );
}
