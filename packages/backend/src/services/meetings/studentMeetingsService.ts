import { isNonEmptyString } from 'shared';
import {
  findMeetingsByStudent,
  insertMeeting,
} from '../../models/meetings/index.js';
import type { MeetingRow } from '../../models/meetings/index.js';
import { findStudentProfile } from '../../models/profile/index.js';
import { toNullableString } from '../../utils/helpers.js';
import type { Result } from '../../utils/helpers.js';

export type MeetingErrorCode =
  | 'SELF_ONLY'
  | 'REASON_REQUIRED'
  | 'STUDENT_NOT_FOUND'
  | 'NO_MENTOR'
  | 'MISSING_STUDENT'
  | 'NOT_ASSIGNED'
  | 'NOT_FOUND'
  | 'NOT_OWNED'
  | 'NOT_PARTICIPANT'
  | 'INVALID_STATE'
  | 'INVALID_MARKS'
  | 'NO_SKILLS';

export function listStudentMeetings(
  registrationNo: string
): Promise<MeetingRow[]> {
  return findMeetingsByStudent(registrationNo);
}

export async function requestMeeting(
  studentRegistrationNo: string,
  input: Record<string, unknown>
): Promise<Result<{ meetingId: number }, MeetingErrorCode>> {
  const studentId = toNullableString(input.student_id);
  if (studentId !== null && studentId !== studentRegistrationNo) {
    return { success: false, code: 'SELF_ONLY' };
  }

  if (!isNonEmptyString(input.reason)) {
    return { success: false, code: 'REASON_REQUIRED' };
  }

  const student = await findStudentProfile(studentRegistrationNo);
  if (student === null) {
    return { success: false, code: 'STUDENT_NOT_FOUND' };
  }
  if (student.assigned_faculty_email === null) {
    return { success: false, code: 'NO_MENTOR' };
  }

  const meetingId = await insertMeeting(
    studentRegistrationNo,
    student.assigned_faculty_email,
    'student',
    input.reason,
    'pending'
  );

  return { success: true, data: { meetingId } };
}
