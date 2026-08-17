/**
 * Credential lookups and account creation.
 *
 * `password_hash` never leaves this layer except to the auth service, which
 * compares it and discards it — it is never included in an API response.
 */

import type { RowDataPacket } from 'mysql2/promise';
import { mutate, queryOne } from '../shared/index.js';

export interface StudentCredentialsRow extends RowDataPacket {
  registration_no: string;
  name: string;
  password_hash: string;
}

export interface FacultyCredentialsRow extends RowDataPacket {
  email: string;
  name: string;
  password_hash: string;
}

export interface NewStudent {
  name: string;
  registration_no: string;
  degree: string | null;
  branch: string | null;
  year: number | null;
  gender: string | null;
  dob: string | null;
  linked_in: string | null;
  github: string | null;
  passwordHash: string;
}

export interface NewFaculty {
  name: string;
  email: string;
  designation: string | null;
  department: string | null;
  phone_number: string | null;
  linked_in: string | null;
  muj_page: string | null;
  passwordHash: string;
}

export function findStudentCredentials(
  registrationNo: string
): Promise<StudentCredentialsRow | null> {
  return queryOne<StudentCredentialsRow>(
    `SELECT registration_no, name, password_hash FROM student WHERE registration_no = ?`,
    [registrationNo]
  );
}

export function findFacultyCredentials(
  email: string
): Promise<FacultyCredentialsRow | null> {
  return queryOne<FacultyCredentialsRow>(
    `SELECT email, name, password_hash FROM faculty WHERE email = ?`,
    [email]
  );
}

/** Throws a duplicate-entry error if the registration number already exists. */
export async function insertStudent(student: NewStudent): Promise<void> {
  await mutate(
    `INSERT INTO student(name, registration_no, degree, branch, year, gender, dob, linked_in, github, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      student.name,
      student.registration_no,
      student.degree,
      student.branch,
      student.year,
      student.gender,
      student.dob,
      student.linked_in,
      student.github,
      student.passwordHash,
    ]
  );
}

/** Throws a duplicate-entry error if the email is already registered. */
export async function insertFaculty(faculty: NewFaculty): Promise<void> {
  await mutate(
    `INSERT INTO faculty(name, email, designation, department, phone_number, linked_in, muj_page, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      faculty.name,
      faculty.email,
      faculty.designation,
      faculty.department,
      faculty.phone_number,
      faculty.linked_in,
      faculty.muj_page,
      faculty.passwordHash,
    ]
  );
}
