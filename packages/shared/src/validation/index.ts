/**
 * Validation helpers shared by the backend and frontend, so both sides enforce
 * the same rules (the backend still validates independently — the frontend copy
 * is only for fast feedback).
 */

import {
  MARKS_MAX,
  MARKS_MIN,
  MEETING_STATUSES,
  PASSWORD_MIN_LENGTH,
  QUERY_STATUSES,
  USER_TYPES,
} from '../constants/index.js';
import type { MeetingStatus, QueryStatus, UserType } from '../types/index.js';

/** A password must be at least PASSWORD_MIN_LENGTH characters. */
export function isValidPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH;
}

/** Marks must be a whole number within [MARKS_MIN, MARKS_MAX]. */
export function isValidMarks(marks: unknown): marks is number {
  const value = Number(marks);
  return Number.isInteger(value) && value >= MARKS_MIN && value <= MARKS_MAX;
}

/** At least one skill must be selected when completing a meeting. */
export function isValidSkillSelection(skills: unknown): skills is number[] {
  return Array.isArray(skills) && skills.length > 0;
}

export function isQueryStatus(value: unknown): value is QueryStatus {
  return (
    typeof value === 'string' &&
    (QUERY_STATUSES as readonly string[]).includes(value)
  );
}

export function isMeetingStatus(value: unknown): value is MeetingStatus {
  return (
    typeof value === 'string' &&
    (MEETING_STATUSES as readonly string[]).includes(value)
  );
}

export function isUserType(value: unknown): value is UserType {
  return (
    typeof value === 'string' &&
    (USER_TYPES as readonly string[]).includes(value)
  );
}

/** True when the value is a string with at least one non-whitespace character. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
