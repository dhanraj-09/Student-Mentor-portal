import bcrypt from 'bcryptjs';
import { BCRYPT_SALT_ROUNDS, isValidPassword } from 'shared';
import {
  findFacultyCredentials,
  findStudentCredentials,
  insertFaculty,
  insertStudent,
} from '../../models/auth/index.js';
import { isDuplicateEntryError } from '../../models/shared/index.js';
import { toNullableNumber, toNullableString } from '../../utils/helpers.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt.js';

export type AuthErrorCode =
  | 'MISSING_CREDENTIALS'
  | 'WEAK_PASSWORD'
  | 'DUPLICATE_ACCOUNT'
  | 'INVALID_CREDENTIALS'
  | 'MISSING_REFRESH_TOKEN'
  | 'INVALID_REFRESH_TOKEN';

export type ServiceResult<T> =
  { success: true; data: T } | { success: false; code: AuthErrorCode };

export interface StudentSession {
  accessToken: string;
  refreshToken: string;
  student: { registration_no: string; name: string };
}

export interface FacultySession {
  accessToken: string;
  refreshToken: string;
  faculty: { email: string; name: string };
}

export type RegistrationInput = Record<string, unknown>;

export async function registerStudent(
  input: RegistrationInput
): Promise<ServiceResult<null>> {
  const registrationNo = toNullableString(input.registration_no);
  const password = input.password;

  if (
    registrationNo === null ||
    typeof password !== 'string' ||
    password.length === 0
  ) {
    return { success: false, code: 'MISSING_CREDENTIALS' };
  }
  if (!isValidPassword(password)) {
    return { success: false, code: 'WEAK_PASSWORD' };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  try {
    await insertStudent({
      name: toNullableString(input.name) ?? '',
      registration_no: registrationNo,
      degree: toNullableString(input.degree),
      branch: toNullableString(input.branch),
      year: toNullableNumber(input.year),
      gender: toNullableString(input.gender),
      dob: toNullableString(input.dob),
      linked_in: toNullableString(input.linked_in),
      github: toNullableString(input.github),
      passwordHash,
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { success: false, code: 'DUPLICATE_ACCOUNT' };
    }
    throw error;
  }

  return { success: true, data: null };
}

export async function registerFaculty(
  input: RegistrationInput
): Promise<ServiceResult<null>> {
  const email = toNullableString(input.email);
  const password = input.password;

  if (email === null || typeof password !== 'string' || password.length === 0) {
    return { success: false, code: 'MISSING_CREDENTIALS' };
  }
  if (!isValidPassword(password)) {
    return { success: false, code: 'WEAK_PASSWORD' };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  try {
    await insertFaculty({
      name: toNullableString(input.name) ?? '',
      email,
      designation: toNullableString(input.designation),
      department: toNullableString(input.department),
      phone_number: toNullableString(input.phone_number),
      linked_in: toNullableString(input.linked_in),
      muj_page: toNullableString(input.muj_page),
      passwordHash,
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { success: false, code: 'DUPLICATE_ACCOUNT' };
    }
    throw error;
  }

  return { success: true, data: null };
}

export async function loginStudent(
  registrationNoInput: unknown,
  passwordInput: unknown
): Promise<ServiceResult<StudentSession>> {
  const registrationNo = toNullableString(registrationNoInput);

  if (
    registrationNo === null ||
    typeof passwordInput !== 'string' ||
    passwordInput.length === 0
  ) {
    return { success: false, code: 'MISSING_CREDENTIALS' };
  }

  const student = await findStudentCredentials(registrationNo);

  // the endpoint cannot be used to enumerate registration numbers.
  if (
    student === null ||
    !(await bcrypt.compare(passwordInput, student.password_hash))
  ) {
    return { success: false, code: 'INVALID_CREDENTIALS' };
  }

  const payload = {
    registration_no: student.registration_no,
    type: 'student',
  } as const;

  return {
    success: true,
    data: {
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
      student: { registration_no: student.registration_no, name: student.name },
    },
  };
}

export async function loginFaculty(
  emailInput: unknown,
  passwordInput: unknown
): Promise<ServiceResult<FacultySession>> {
  const email = toNullableString(emailInput);

  if (
    email === null ||
    typeof passwordInput !== 'string' ||
    passwordInput.length === 0
  ) {
    return { success: false, code: 'MISSING_CREDENTIALS' };
  }

  const faculty = await findFacultyCredentials(email);

  if (
    faculty === null ||
    !(await bcrypt.compare(passwordInput, faculty.password_hash))
  ) {
    return { success: false, code: 'INVALID_CREDENTIALS' };
  }

  const payload = { email: faculty.email, type: 'faculty' } as const;

  return {
    success: true,
    data: {
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
      faculty: { email: faculty.email, name: faculty.name },
    },
  };
}

export function refreshAccessToken(token: string | undefined): ServiceResult<{
  accessToken: string;
}> {
  if (token === undefined || token.length === 0) {
    return { success: false, code: 'MISSING_REFRESH_TOKEN' };
  }

  const result = verifyRefreshToken(token);
  if (!result.valid) {
    return { success: false, code: 'INVALID_REFRESH_TOKEN' };
  }

  const payload = result.payload;
  const accessToken =
    payload.type === 'student'
      ? signAccessToken({
          registration_no: payload.registration_no,
          type: 'student',
        })
      : signAccessToken({ email: payload.email, type: 'faculty' });

  return { success: true, data: { accessToken } };
}
