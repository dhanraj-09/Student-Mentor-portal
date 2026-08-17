/**
 * Faculty-side meeting logic — the lifecycle transitions.
 *
 * Every transition re-reads the meeting and checks both ownership and the
 * current status, so a stale client cannot skip a gate.
 */

import { isValidMarks, isValidSkillSelection } from 'shared';
import {
  completeMeeting as persistCompletion,
  findMeetingOwnedByFaculty,
  findMeetingsByFaculty,
  insertMeeting,
  updateMeetingStatus,
} from '../../models/meetings/index.js';
import type { MeetingRow } from '../../models/meetings/index.js';
import { findStudentProfile } from '../../models/profile/index.js';
import { toNullableString } from '../../utils/helpers.js';
import type { Result } from '../../utils/helpers.js';
import type { MeetingErrorCode } from './studentMeetingsService.js';

export function listFacultyMeetings(
  facultyEmail: string
): Promise<MeetingRow[]> {
  return findMeetingsByFaculty(facultyEmail);
}

/** A faculty-created meeting skips `pending` — creating it *is* accepting it. */
export async function createMeeting(
  facultyEmail: string,
  input: Record<string, unknown>
): Promise<Result<{ meetingId: number }, MeetingErrorCode>> {
  const studentId = toNullableString(input.student_id);
  if (studentId === null) {
    return { success: false, code: 'MISSING_STUDENT' };
  }

  const student = await findStudentProfile(studentId);
  if (student === null || student.assigned_faculty_email !== facultyEmail) {
    return { success: false, code: 'NOT_ASSIGNED' };
  }

  const meetingId = await insertMeeting(
    studentId,
    facultyEmail,
    'faculty',
    toNullableString(input.reason),
    'accepted'
  );

  return { success: true, data: { meetingId } };
}

/** pending -> accepted (gate 1 of 2). */
export async function acceptMeeting(
  facultyEmail: string,
  meetingId: string
): Promise<Result<null, MeetingErrorCode>> {
  const meeting = await findMeetingOwnedByFaculty(meetingId, facultyEmail);
  if (meeting === null) {
    return { success: false, code: 'NOT_OWNED' };
  }
  if (meeting.status !== 'pending') {
    return {
      success: false,
      code: 'INVALID_STATE',
      detail: `Only a pending meeting can be accepted (current: ${meeting.status})`,
    };
  }

  await updateMeetingStatus(meetingId, 'accepted');
  return { success: true, data: null };
}

/** accepted + both parties ready -> ongoing (gate 2 of 2). */
export async function startMeeting(
  facultyEmail: string,
  meetingId: string
): Promise<Result<null, MeetingErrorCode>> {
  const meeting = await findMeetingOwnedByFaculty(meetingId, facultyEmail);
  if (meeting === null) {
    return { success: false, code: 'NOT_OWNED' };
  }
  if (meeting.status !== 'accepted') {
    return {
      success: false,
      code: 'INVALID_STATE',
      detail: `Only an accepted meeting can be started (current: ${meeting.status})`,
    };
  }
  if (meeting.student_ready === 0 || meeting.faculty_ready === 0) {
    return {
      success: false,
      code: 'INVALID_STATE',
      detail: 'Both the student and you must be marked ready before starting',
    };
  }

  await updateMeetingStatus(meetingId, 'ongoing');
  return { success: true, data: null };
}

/** ongoing -> completed, recording marks and the skills discussed atomically. */
export async function completeMeeting(
  facultyEmail: string,
  meetingId: string,
  input: Record<string, unknown>
): Promise<Result<null, MeetingErrorCode>> {
  if (!isValidMarks(input.marks)) {
    return { success: false, code: 'INVALID_MARKS' };
  }
  if (!isValidSkillSelection(input.skills)) {
    return { success: false, code: 'NO_SKILLS' };
  }

  const meeting = await findMeetingOwnedByFaculty(meetingId, facultyEmail);
  if (meeting === null) {
    return { success: false, code: 'NOT_OWNED' };
  }
  if (meeting.status !== 'ongoing') {
    return {
      success: false,
      code: 'INVALID_STATE',
      detail: `Only an ongoing meeting can be completed (current: ${meeting.status})`,
    };
  }

  await persistCompletion(meetingId, Number(input.marks), input.skills);
  return { success: true, data: null };
}
