/** Constants shared by the backend and frontend. */

import type { MeetingStatus, QueryStatus, UserType } from '../types/index.js';

// ===== Roles =====

export const USER_TYPES: readonly UserType[] = ['student', 'faculty'] as const;

// ===== Queries =====

export const QUERY_STATUSES: readonly QueryStatus[] = [
  'Pending',
  'Resolved',
] as const;

// ===== Meetings =====

export const MEETING_STATUSES: readonly MeetingStatus[] = [
  'pending',
  'accepted',
  'ongoing',
  'completed',
] as const;

/** Marks a faculty records when completing a meeting. */
export const MARKS_MIN = 0;
export const MARKS_MAX = 30;

// ===== Auth =====

export const PASSWORD_MIN_LENGTH = 8;

/** bcrypt cost factor used when hashing passwords. */
export const BCRYPT_SALT_ROUNDS = 10;

/** Short-lived access token — held in memory on the client, never in storage. */
export const ACCESS_TOKEN_EXPIRY = '30m';

/** Long-lived refresh token — httpOnly, path-scoped cookie. */
export const REFRESH_TOKEN_EXPIRY = '7d';

export const REFRESH_COOKIE_NAME = 'refreshToken';

/** The cookie is scoped to this path so it is only ever sent to the refresh endpoint. */
export const REFRESH_COOKIE_PATH = '/auth/refresh-token';

export const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** JWTs are signed with HMAC-SHA256; the algorithm is pinned on verify. */
export const JWT_ALGORITHM = 'HS256';

// ===== Route prefixes =====

export const AUTH_PREFIX = '/auth';
export const API_PREFIX = '/api';
