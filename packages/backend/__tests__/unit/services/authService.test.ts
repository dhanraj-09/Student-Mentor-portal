import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FACULTY_EMAIL,
  KNOWN_PASSWORD,
  KNOWN_PASSWORD_HASH,
  STUDENT_REGISTRATION_NO,
} from '../../fixtures/mockData.js';

const findStudentCredentials = vi.fn();
const findFacultyCredentials = vi.fn();
const insertStudent = vi.fn();
const insertFaculty = vi.fn();

vi.mock('../../../src/models/auth/index.js', () => ({
  findStudentCredentials: (...args: unknown[]) =>
    findStudentCredentials(...args),
  findFacultyCredentials: (...args: unknown[]) =>
    findFacultyCredentials(...args),
  insertStudent: (...args: unknown[]) => insertStudent(...args),
  insertFaculty: (...args: unknown[]) => insertFaculty(...args),
}));

const {
  loginFaculty,
  loginStudent,
  refreshAccessToken,
  registerFaculty,
  registerStudent,
} = await import('../../../src/services/auth/authService.js');
const { verifyAccessToken, verifyRefreshToken, signRefreshToken } =
  await import('../../../src/utils/jwt.js');

beforeEach(() => {
  vi.clearAllMocks();
  findStudentCredentials.mockResolvedValue(null);
  findFacultyCredentials.mockResolvedValue(null);
  insertStudent.mockResolvedValue(undefined);
  insertFaculty.mockResolvedValue(undefined);
});

describe('registerStudent', () => {
  it('rejects a password below the minimum length', async () => {
    const result = await registerStudent({
      registration_no: STUDENT_REGISTRATION_NO,
      password: 'short',
    });

    expect(result).toEqual({ success: false, code: 'WEAK_PASSWORD' });
    expect(insertStudent).not.toHaveBeenCalled();
  });

  it('rejects a missing registration number before hashing anything', async () => {
    const result = await registerStudent({ password: 'long-enough-password' });

    expect(result).toEqual({ success: false, code: 'MISSING_CREDENTIALS' });
    expect(insertStudent).not.toHaveBeenCalled();
  });

  it('stores a bcrypt hash rather than the password', async () => {
    const result = await registerStudent({
      registration_no: STUDENT_REGISTRATION_NO,
      name: 'Asha Nair',
      password: KNOWN_PASSWORD,
    });

    expect(result.success).toBe(true);
    const stored = insertStudent.mock.calls[0][0] as { passwordHash: string };
    expect(stored.passwordHash).not.toBe(KNOWN_PASSWORD);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('maps a duplicate key collision to DUPLICATE_ACCOUNT', async () => {
    insertStudent.mockRejectedValue(
      Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' })
    );

    const result = await registerStudent({
      registration_no: STUDENT_REGISTRATION_NO,
      password: KNOWN_PASSWORD,
    });

    expect(result).toEqual({ success: false, code: 'DUPLICATE_ACCOUNT' });
  });

  it('rethrows a database failure it does not recognise', async () => {
    insertStudent.mockRejectedValue(new Error('connection lost'));

    await expect(
      registerStudent({
        registration_no: STUDENT_REGISTRATION_NO,
        password: KNOWN_PASSWORD,
      })
    ).rejects.toThrow('connection lost');
  });
});

describe('registerFaculty', () => {
  it('requires an email', async () => {
    const result = await registerFaculty({ password: KNOWN_PASSWORD });

    expect(result).toEqual({ success: false, code: 'MISSING_CREDENTIALS' });
  });

  it('maps a duplicate key collision to DUPLICATE_ACCOUNT', async () => {
    insertFaculty.mockRejectedValue(
      Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' })
    );

    const result = await registerFaculty({
      email: FACULTY_EMAIL,
      password: KNOWN_PASSWORD,
    });

    expect(result).toEqual({ success: false, code: 'DUPLICATE_ACCOUNT' });
  });
});

describe('loginStudent', () => {
  it('issues a matched access/refresh pair on the right password', async () => {
    findStudentCredentials.mockResolvedValue({
      registration_no: STUDENT_REGISTRATION_NO,
      name: 'Asha Nair',
      password_hash: KNOWN_PASSWORD_HASH,
    });

    const result = await loginStudent(STUDENT_REGISTRATION_NO, KNOWN_PASSWORD);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const access = verifyAccessToken(result.data.accessToken);
    const refresh = verifyRefreshToken(result.data.refreshToken);
    expect(access.valid).toBe(true);
    expect(refresh.valid).toBe(true);
    expect(result.data.student).toEqual({
      registration_no: STUDENT_REGISTRATION_NO,
      name: 'Asha Nair',
    });
  });

  it('rejects the wrong password', async () => {
    findStudentCredentials.mockResolvedValue({
      registration_no: STUDENT_REGISTRATION_NO,
      name: 'Asha Nair',
      password_hash: KNOWN_PASSWORD_HASH,
    });

    const result = await loginStudent(
      STUDENT_REGISTRATION_NO,
      'wrong-password'
    );

    expect(result).toEqual({ success: false, code: 'INVALID_CREDENTIALS' });
  });

  it('gives an unknown account the same answer as a wrong password, so the endpoint cannot enumerate registration numbers', async () => {
    findStudentCredentials.mockResolvedValue(null);

    const result = await loginStudent('999999999', KNOWN_PASSWORD);

    expect(result).toEqual({ success: false, code: 'INVALID_CREDENTIALS' });
  });

  it('does not reach the database without a password', async () => {
    const result = await loginStudent(STUDENT_REGISTRATION_NO, '');

    expect(result).toEqual({ success: false, code: 'MISSING_CREDENTIALS' });
    expect(findStudentCredentials).not.toHaveBeenCalled();
  });
});

describe('loginFaculty', () => {
  it('issues tokens carrying the faculty identity', async () => {
    findFacultyCredentials.mockResolvedValue({
      email: FACULTY_EMAIL,
      name: 'Dr. Meera Iyer',
      password_hash: KNOWN_PASSWORD_HASH,
    });

    const result = await loginFaculty(FACULTY_EMAIL, KNOWN_PASSWORD);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const access = verifyAccessToken(result.data.accessToken);
    expect(access.valid).toBe(true);
    if (!access.valid) return;
    expect(access.payload).toMatchObject({
      email: FACULTY_EMAIL,
      type: 'faculty',
    });
  });
});

describe('refreshAccessToken', () => {
  it('mints a fresh access token from a valid refresh token', () => {
    const refreshToken = signRefreshToken({
      registration_no: STUDENT_REGISTRATION_NO,
      type: 'student',
    });

    const result = refreshAccessToken(refreshToken);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const verified = verifyAccessToken(result.data.accessToken);
    expect(verified.valid).toBe(true);
    if (!verified.valid) return;
    expect(verified.payload).toMatchObject({
      registration_no: STUDENT_REGISTRATION_NO,
      type: 'student',
    });
  });

  it('refuses a missing cookie', () => {
    expect(refreshAccessToken(undefined)).toEqual({
      success: false,
      code: 'MISSING_REFRESH_TOKEN',
    });
  });

  it('refuses a token that is not a refresh token', () => {
    expect(refreshAccessToken('garbage')).toEqual({
      success: false,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });
});
