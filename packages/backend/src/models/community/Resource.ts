import type { RowDataPacket } from 'mysql2/promise';
import { mutate, query, queryOne } from '../shared/index.js';

export interface ResourceRow extends RowDataPacket {
  resource_id: number;
  faculty_email: string;
  title: string;
  description: string | null;
  url: string | null;
  category: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface NewResource {
  faculty_email: string;
  title: string;
  description: string | null;
  url: string | null;
  category: string | null;
}

export interface ResourceUpdate {
  title: string;
  description: string | null;
  url: string | null;
  category: string | null;
}

const RESOURCE_COLUMNS = `resource_id, faculty_email, title, description, url, category, created_at, updated_at`;

export function findResourcesByFaculty(
  facultyEmail: string
): Promise<ResourceRow[]> {
  return query<ResourceRow>(
    `SELECT ${RESOURCE_COLUMNS} FROM resources WHERE faculty_email = ? ORDER BY created_at DESC`,
    [facultyEmail]
  );
}

/**
 * A student sees exactly the resources posted by the mentor they are currently
 * assigned to; the join is what enforces that, so an unassigned student gets an
 * empty list rather than everybody's resources.
 */
export function findResourcesForStudent(
  registrationNo: string
): Promise<ResourceRow[]> {
  return query<ResourceRow>(
    `SELECT r.resource_id, r.faculty_email, r.title, r.description, r.url,
            r.category, r.created_at, r.updated_at
     FROM resources r
     JOIN student s ON s.assigned_faculty_email = r.faculty_email
     WHERE s.registration_no = ?
     ORDER BY r.created_at DESC`,
    [registrationNo]
  );
}

export function findResourceOwnedByFaculty(
  resourceId: string,
  facultyEmail: string
): Promise<ResourceRow | null> {
  return queryOne<ResourceRow>(
    `SELECT ${RESOURCE_COLUMNS} FROM resources WHERE resource_id = ? AND faculty_email = ?`,
    [resourceId, facultyEmail]
  );
}

export async function insertResource(resource: NewResource): Promise<number> {
  const result = await mutate(
    `INSERT INTO resources(faculty_email, title, description, url, category)
     VALUES (?, ?, ?, ?, ?)`,
    [
      resource.faculty_email,
      resource.title,
      resource.description,
      resource.url,
      resource.category,
    ]
  );
  return result.insertId;
}

export async function updateResource(
  resourceId: string,
  facultyEmail: string,
  resource: ResourceUpdate
): Promise<number> {
  const result = await mutate(
    `UPDATE resources
     SET title = ?, description = ?, url = ?, category = ?
     WHERE resource_id = ? AND faculty_email = ?`,
    [
      resource.title,
      resource.description,
      resource.url,
      resource.category,
      resourceId,
      facultyEmail,
    ]
  );
  return result.affectedRows;
}

export async function deleteResource(
  resourceId: string,
  facultyEmail: string
): Promise<number> {
  const result = await mutate(
    `DELETE FROM resources WHERE resource_id = ? AND faculty_email = ?`,
    [resourceId, facultyEmail]
  );
  return result.affectedRows;
}
