import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FACULTY_EMAIL,
  KNOWN_PASSWORD,
  KNOWN_PASSWORD_HASH,
  STUDENT_REGISTRATION_NO,
} from '../fixtures/mockData.js';

const findStudentCredentials = vi.fn();
const findFacultyCredentials = vi.fn();
const insertStudent = vi.fn();
const insertFaculty = vi.fn();

vi.mock('../../src/models/auth/index.js', () => ({
  findStudentCredentials: (...a: unknown[]) => findStudentCredentials(...a),
  findFacultyCredentials: (...a: unknown[]) => findFacultyCredentials(...a),
  insertStudent: (...a: unknown[]) => insertStudent(...a),
  insertFaculty: (...a: unknown[]) => insertFaculty(...a),
}));

const { createApp } = await import('../../src/server.js');

let app: Express;

/** Pulls one Set-Cookie header by name. */
function cookieNamed(
  headers: Record<string, unknown>,
  name: string
): string | undefined {
  const raw = headers['set-cookie'];
  const all = Array.isArray(raw) ? (raw as string[]) : [];
  return all.find((cookie) => cookie.startsWith(`${name}=`));
}

beforeEach(() => {
  vi.clearAllMocks();
  findStudentCredentials.mockResolvedValue(null);
  findFacultyCredentials.mockResolvedValue(null);
  insertStudent.mockResolvedValue(undefined);
  insertFaculty.mockResolvedValue(undefined);
  app = createApp();
});

describe('student registration', () => {
  it('creates the account and does not log the caller in', async () => {
    const response = await request(app).post('/auth/register-student').send({
      registration_no: STUDENT_REGISTRATION_NO,
      name: 'Asha Nair',
      password: KNOWN_PASSWORD,
    });

    expect(response.status).toBe(201);
    // Registration must not hand back a session.
    expect(response.body.accessToken).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('refuses a weak password', async () => {
    const response = await request(app)
      .post('/auth/register-student')
      .send({ registration_no: STUDENT_REGISTRATION_NO, password: 'abc' });

    expect(response.status).toBe(400);
    expect(insertStudent).not.toHaveBeenCalled();
  });

  it('reports a duplicate registration number as a client error', async () => {
    insertStudent.mockRejectedValue(
      Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' })
    );

    const response = await request(app).post('/auth/register-student').send({
      registration_no: STUDENT_REGISTRATION_NO,
      password: KNOWN_PASSWORD,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/already exists/i);
  });
});

describe('login, refresh and logout', () => {
  beforeEach(() => {
    findStudentCredentials.mockResolvedValue({
      registration_no: STUDENT_REGISTRATION_NO,
      name: 'Asha Nair',
      password_hash: KNOWN_PASSWORD_HASH,
    });
  });

  it('returns an access token in the body and the refresh token only as an httpOnly cookie', async () => {
    const response = await request(app).post('/auth/login-student').send({
      registration_no: STUDENT_REGISTRATION_NO,
      password: KNOWN_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(typeof response.body.accessToken).toBe('string');
    // The refresh token must never be readable by page scripts.
    expect(JSON.stringify(response.body)).not.toContain('refreshToken');

    const cookie = cookieNamed(response.headers, 'refreshToken_student');
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    // Scoped to the student refresh path so a faculty session in the same
    // browser cannot be clobbered.
    expect(cookie).toContain('Path=/auth/refresh-token/student');
  });

  it('exchanges the refresh cookie for a new access token', async () => {
    const login = await request(app).post('/auth/login-student').send({
      registration_no: STUDENT_REGISTRATION_NO,
      password: KNOWN_PASSWORD,
    });
    const cookie = cookieNamed(login.headers, 'refreshToken_student');

    const refreshed = await request(app)
      .post('/auth/refresh-token/student')
      .set('Cookie', cookie ?? '');

    expect(refreshed.status).toBe(200);
    expect(typeof refreshed.body.accessToken).toBe('string');
  });

  it('refuses to refresh without the cookie', async () => {
    const response = await request(app).post('/auth/refresh-token/student');

    expect(response.status).toBe(401);
  });

  it('will not accept a student refresh cookie at the faculty endpoint', async () => {
    const login = await request(app).post('/auth/login-student').send({
      registration_no: STUDENT_REGISTRATION_NO,
      password: KNOWN_PASSWORD,
    });
    const cookie = cookieNamed(login.headers, 'refreshToken_student');

    // The faculty endpoint reads refreshToken_faculty, which was never set.
    const response = await request(app)
      .post('/auth/refresh-token/faculty')
      .set('Cookie', cookie ?? '');

    expect(response.status).toBe(401);
  });

  it('clears the cookie on logout', async () => {
    const response = await request(app).post('/auth/logout/student');

    expect(response.status).toBe(200);
    const cookie = cookieNamed(response.headers, 'refreshToken_student');
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('rejects a bad password without revealing whether the account exists', async () => {
    const wrongPassword = await request(app).post('/auth/login-student').send({
      registration_no: STUDENT_REGISTRATION_NO,
      password: 'not-the-password',
    });

    findStudentCredentials.mockResolvedValue(null);
    const noSuchAccount = await request(app)
      .post('/auth/login-student')
      .send({ registration_no: '000000000', password: KNOWN_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(noSuchAccount.status).toBe(401);
    expect(noSuchAccount.body.error).toBe(wrongPassword.body.error);
  });
});

describe('faculty login', () => {
  it('sets the faculty-scoped cookie', async () => {
    findFacultyCredentials.mockResolvedValue({
      email: FACULTY_EMAIL,
      name: 'Dr. Meera Iyer',
      password_hash: KNOWN_PASSWORD_HASH,
    });

    const response = await request(app)
      .post('/auth/login-faculty')
      .send({ email: FACULTY_EMAIL, password: KNOWN_PASSWORD });

    expect(response.status).toBe(200);
    const cookie = cookieNamed(response.headers, 'refreshToken_faculty');
    expect(cookie).toContain('Path=/auth/refresh-token/faculty');
  });
});

describe('transport-level failures', () => {
  it('answers 404 with a route-not-found body', async () => {
    const response = await request(app).get('/api/no-such-route');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Route not found');
  });

  it('turns a malformed JSON body into 400 rather than 500', async () => {
    const response = await request(app)
      .post('/auth/login-student')
      .set('Content-Type', 'application/json')
      .send('{"registration_no": ');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('MALFORMED_JSON');
  });

  it('reports server health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'Server is running' });
  });

  it('attaches a correlation id to every response', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
  });
});
