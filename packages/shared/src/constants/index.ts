import type { MeetingStatus, QueryStatus, UserType } from '../types/index.js';

export const USER_TYPES: readonly UserType[] = ['student', 'faculty'] as const;

export const QUERY_STATUSES: readonly QueryStatus[] = [
  'Pending',
  'Resolved',
] as const;

export const MEETING_STATUSES: readonly MeetingStatus[] = [
  'pending',
  'accepted',
  'ongoing',
  'completed',
] as const;

export const MARKS_MIN = 0;
export const MARKS_MAX = 30;

export const PASSWORD_MIN_LENGTH = 8;

export const BCRYPT_SALT_ROUNDS = 10;

export const ACCESS_TOKEN_EXPIRY = '30m';

export const REFRESH_TOKEN_EXPIRY = '7d';

// Refresh cookies are scoped per role — distinct name AND path — so a student
// session and a faculty session can coexist in the same browser without one
// login overwriting the other's cookie.
export const REFRESH_COOKIE_NAMES: Record<UserType, string> = {
  student: 'refreshToken_student',
  faculty: 'refreshToken_faculty',
};

export const REFRESH_COOKIE_PATHS: Record<UserType, string> = {
  student: '/auth/refresh-token/student',
  faculty: '/auth/refresh-token/faculty',
};

export const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const JWT_ALGORITHM = 'HS256';

export const AUTH_PREFIX = '/auth';
export const API_PREFIX = '/api';
