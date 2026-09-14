#!/usr/bin/env node
/* eslint-disable no-console -- operator facing CLI */
/**
 * Seeds the local database with a faculty member, a student assigned to them,
 * and a meeting in each interesting state, by driving the real API exactly the
 * way the app does.
 *
 *   node infra/mysql/seed-dev.mjs
 *
 * Passwords come from SEED_FACULTY_PASSWORD / SEED_STUDENT_PASSWORD when set.
 */
import mysql from 'mysql2/promise';

const API = process.env.SEED_API_URL ?? 'http://localhost:8080';

/**
 * A student the college has provisioned but who has never logged in: the row
 * exists with no password, which is what puts them into the first login flow.
 * Registration through the API always sets a password, so this one is inserted
 * directly, the way a student import would.
 */
const PROVISIONED = {
  registration_no: process.env.SEED_PROVISIONED_REG ?? '229301777',
  name: 'Harsh Depura',
  email: process.env.SEED_PROVISIONED_EMAIL ?? 'harsh.depura@college.edu',
};

async function provisionPasswordlessStudent(facultyEmail) {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3307),
    user: process.env.DB_USER ?? 'portal',
    password: process.env.DB_PASSWORD ?? 'portal',
    database: process.env.DB_NAME ?? 'student_mentor',
  });

  try {
    await connection.query(
      `INSERT INTO student
         (registration_no, name, email, degree, branch, year, password_hash, assigned_faculty_email)
       VALUES (?, ?, ?, 'B.Tech', 'CSE', 3, NULL, ?)
       ON DUPLICATE KEY UPDATE
         email = VALUES(email),
         password_hash = NULL,
         assigned_faculty_email = VALUES(assigned_faculty_email)`,
      [
        PROVISIONED.registration_no,
        PROVISIONED.name,
        PROVISIONED.email,
        facultyEmail,
      ]
    );
    console.log(
      `- provisioned ${PROVISIONED.registration_no} with no password (first login flow)`
    );
  } finally {
    await connection.end();
  }
}

const FACULTY = {
  name: 'Dr. Asha Mehta',
  email: process.env.SEED_FACULTY_EMAIL ?? 'asha@muj.edu',
  designation: 'Associate Professor',
  department: 'CSE',
  phone_number: '9999999999',
  linked_in: '',
  muj_page: '',
  password: process.env.SEED_FACULTY_PASSWORD ?? 'Faculty-Pass-1',
};

const STUDENT = {
  name: 'Ravi Sharma',
  registration_no: process.env.SEED_STUDENT_REG ?? '229301001',
  degree: 'B.Tech',
  branch: 'CSE',
  year: '3',
  gender: 'Male',
  dob: '2005-04-12',
  linked_in: '',
  github: '',
  password: process.env.SEED_STUDENT_PASSWORD ?? 'Student-Pass-1',
};

async function call(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text === '' ? null : JSON.parse(text);
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${text}`);
  }
  return data;
}

async function register(path, body, label) {
  try {
    await call(path, { method: 'POST', body });
    console.log(`- created ${label}`);
  } catch (error) {
    // The API reports an existing account as 400 "That account already exists".
    if (/already exists/i.test(String(error.message))) {
      console.log(`- ${label} already exists`);
      return;
    }
    throw error;
  }
}

async function main() {
  await register('/auth/register-faculty', FACULTY, `faculty ${FACULTY.email}`);
  await register(
    '/auth/register-student',
    STUDENT,
    `student ${STUDENT.registration_no}`
  );

  const faculty = await call('/auth/login-faculty', {
    method: 'POST',
    body: { email: FACULTY.email, password: FACULTY.password },
  });
  const student = await call('/auth/login-student', {
    method: 'POST',
    body: {
      registration_no: STUDENT.registration_no,
      password: STUDENT.password,
    },
  });

  await call('/api/faculty/assign-student', {
    method: 'PUT',
    token: faculty.accessToken,
    body: { registration_no: STUDENT.registration_no, email: FACULTY.email },
  });
  console.log('- student assigned to the faculty mentor');

  // One meeting taken all the way to `ongoing`, which is the state the video
  // call attaches to.
  const requested = await call('/api/meetings/request', {
    method: 'POST',
    token: student.accessToken,
    body: {
      student_id: STUDENT.registration_no,
      reason: 'Sprint review and project guidance',
    },
  });
  const meetingId = requested.meetingId;

  await call(`/api/meetings/${meetingId}/accept`, {
    method: 'PUT',
    token: faculty.accessToken,
    body: {},
  });
  await call(`/api/meetings/${meetingId}/ready`, {
    method: 'PUT',
    token: student.accessToken,
    body: { ready: true },
  });
  await call(`/api/meetings/${meetingId}/ready`, {
    method: 'PUT',
    token: faculty.accessToken,
    body: { ready: true },
  });
  await call(`/api/meetings/${meetingId}/start`, {
    method: 'PUT',
    token: faculty.accessToken,
    body: {},
  });
  console.log(`- meeting ${meetingId} is ongoing`);

  // A second meeting left at `accepted`, to exercise the pre-call states.
  const second = await call('/api/meetings/request', {
    method: 'POST',
    token: student.accessToken,
    body: { student_id: STUDENT.registration_no, reason: 'Doubt clearing' },
  });
  await call(`/api/meetings/${second.meetingId}/accept`, {
    method: 'PUT',
    token: faculty.accessToken,
    body: {},
  });
  console.log(`- meeting ${second.meetingId} is accepted`);

  await provisionPasswordlessStudent(FACULTY.email);

  console.log('\nSign in with:');
  console.log(`  faculty : ${FACULTY.email} / ${FACULTY.password}`);
  console.log(`  student : ${STUDENT.registration_no} / ${STUDENT.password}`);
  console.log(
    `  first login (no password set yet) : ${PROVISIONED.registration_no}`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
