/** Meeting logic used by both roles: skill options, readiness, and detail. */

import type { AuthTokenPayload } from 'shared';
import {
  findMeetingById,
  findMeetingSkills,
  findSkillOptions,
  updateReadiness,
} from '../../models/meetings/index.js';
import type {
  MeetingRow,
  SkillOptionRow,
} from '../../models/meetings/index.js';
import type { Result } from '../../utils/helpers.js';
import type { MeetingErrorCode } from './studentMeetingsService.js';

export function listSkillOptions(): Promise<SkillOptionRow[]> {
  return findSkillOptions();
}

/** Which side of the meeting this user is on, or null if neither. */
function participantRole(
  meeting: MeetingRow,
  user: AuthTokenPayload
): 'student' | 'faculty' | null {
  if (user.type === 'student' && user.registration_no === meeting.student_id)
    return 'student';
  if (user.type === 'faculty' && user.email === meeting.faculty_email)
    return 'faculty';
  return null;
}

/**
 * Sets the caller's own readiness flag. The role comes from the JWT, so a
 * student can only ever set `student_ready` and a faculty `faculty_ready`.
 */
export async function setReadiness(
  user: AuthTokenPayload,
  meetingId: string,
  ready: boolean
): Promise<Result<{ ready: boolean }, MeetingErrorCode>> {
  const meeting = await findMeetingById(meetingId);
  if (meeting === null) {
    return { success: false, code: 'NOT_FOUND' };
  }

  const role = participantRole(meeting, user);
  if (role === null) {
    return { success: false, code: 'NOT_PARTICIPANT' };
  }
  if (meeting.status !== 'accepted') {
    return {
      success: false,
      code: 'INVALID_STATE',
      detail: `Readiness can only be set once the meeting is accepted (current: ${meeting.status})`,
    };
  }

  await updateReadiness(meetingId, role, ready);
  return { success: true, data: { ready } };
}

/**
 * The detail view returns skills as objects, whereas the faculty list view
 * returns them as a rolled-up string — so the string column is replaced here.
 */
export type MeetingDetail = Omit<MeetingRow, 'skills' | 'marks'> & {
  skills: SkillOptionRow[];
  /** Optional because it is withheld from the student's view. */
  marks?: number | null;
};

/**
 * Full detail for one meeting. Marks and skills are stripped for the student,
 * matching the rule that assessment data is faculty-only.
 */
export async function getMeetingDetail(
  user: AuthTokenPayload,
  meetingId: string
): Promise<Result<MeetingDetail, MeetingErrorCode>> {
  const meeting = await findMeetingById(meetingId);
  if (meeting === null) {
    return { success: false, code: 'NOT_FOUND' };
  }

  const role = participantRole(meeting, user);
  if (role === null) {
    return { success: false, code: 'NOT_PARTICIPANT' };
  }

  // The rolled-up `skills` string from the list query is replaced by objects.
  const detail: MeetingDetail = { ...meeting, skills: [] };

  if (role === 'student') {
    // Removed entirely rather than nulled, so marks never reach the student.
    delete detail.marks;
    return { success: true, data: detail };
  }

  detail.skills = await findMeetingSkills(meetingId);
  return { success: true, data: detail };
}
