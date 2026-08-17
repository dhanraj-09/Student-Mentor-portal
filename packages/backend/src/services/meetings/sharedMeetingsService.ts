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

export type MeetingDetail = Omit<MeetingRow, 'skills' | 'marks'> & {
  skills: SkillOptionRow[];
  marks?: number | null;
};

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

  const detail: MeetingDetail = { ...meeting, skills: [] };

  if (role === 'student') {
    delete detail.marks;
    return { success: true, data: detail };
  }

  detail.skills = await findMeetingSkills(meetingId);
  return { success: true, data: detail };
}
