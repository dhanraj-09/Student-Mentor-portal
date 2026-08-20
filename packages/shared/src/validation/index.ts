import {
  MARKS_MAX,
  MARKS_MIN,
  MEETING_STATUSES,
  PASSWORD_MIN_LENGTH,
  QUERY_STATUSES,
  USER_TYPES,
} from '../constants/index.js';
import type { MeetingStatus, QueryStatus, UserType } from '../types/index.js';

export function isValidPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH;
}

export function isValidMarks(marks: unknown): marks is number {
  const value = Number(marks);
  return Number.isInteger(value) && value >= MARKS_MIN && value <= MARKS_MAX;
}

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

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Accepts only http(s) links.
 *
 * The frontend renders a resource url as an anchor, so anything else — most
 * of all `javascript:` — would turn a mentor-supplied string into script
 * execution in a student's browser.
 */
export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const RESOURCE_TITLE_MAX_LENGTH = 255;
export const RESOURCE_URL_MAX_LENGTH = 1024;
