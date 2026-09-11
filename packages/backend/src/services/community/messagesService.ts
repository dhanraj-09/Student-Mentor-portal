import { isNonEmptyString } from 'shared';
import type { AuthTokenPayload, UserType } from 'shared';
import {
  countUnread,
  findFacultyThreads,
  findThread,
  insertMessage,
  markThreadRead,
} from '../../models/community/index.js';
import type {
  MessageRow,
  ThreadSummaryRow,
} from '../../models/community/index.js';
import { findStudentProfile } from '../../models/profile/index.js';
import type { Result } from '../../utils/helpers.js';
import type { PageRequest } from '../../utils/pagination.js';

/**
 * Direct messages between a student and their assigned mentor.
 *
 * Who may talk to whom is decided entirely by the mentorship assignment: a
 * student may only ever address the mentor recorded on their own row, and a
 * mentor only students assigned to them. Nothing accepts a conversation
 * identifier from the caller, so there is no thread id to tamper with.
 */

export type MessageErrorCode =
  | 'EMPTY_MESSAGE'
  | 'TOO_LONG'
  | 'NO_MENTOR'
  | 'STUDENT_NOT_FOUND'
  | 'NOT_ASSIGNED';

export const MAX_MESSAGE_LENGTH = 4000;

/** The mentor a student is allowed to talk to, if they have one. */
async function mentorOf(
  registrationNo: string
): Promise<Result<string, MessageErrorCode>> {
  const student = await findStudentProfile(registrationNo);
  if (student === null) {
    return { success: false, code: 'STUDENT_NOT_FOUND' };
  }
  if (student.assigned_faculty_email === null) {
    return { success: false, code: 'NO_MENTOR' };
  }
  return { success: true, data: student.assigned_faculty_email };
}

/** Confirms a mentor is the one assigned to that student. */
async function assertAssigned(
  facultyEmail: string,
  registrationNo: string
): Promise<Result<null, MessageErrorCode>> {
  const mentor = await mentorOf(registrationNo);
  if (!mentor.success) return mentor;
  if (mentor.data !== facultyEmail) {
    return { success: false, code: 'NOT_ASSIGNED' };
  }
  return { success: true, data: null };
}

export interface ThreadView {
  messages: MessageRow[];
  unread: number;
}

export async function getStudentThread(
  registrationNo: string,
  page?: PageRequest
): Promise<Result<ThreadView, MessageErrorCode>> {
  const mentor = await mentorOf(registrationNo);
  if (!mentor.success) return mentor;

  const [messages, unread] = await Promise.all([
    findThread(
      registrationNo,
      mentor.data,
      page === undefined ? undefined : page.limit + 1,
      page?.offset
    ),
    countUnread(registrationNo, mentor.data, 'student'),
  ]);

  return { success: true, data: { messages, unread } };
}

export async function getFacultyThread(
  facultyEmail: string,
  registrationNo: string,
  page?: PageRequest
): Promise<Result<ThreadView, MessageErrorCode>> {
  const assigned = await assertAssigned(facultyEmail, registrationNo);
  if (!assigned.success) return assigned;

  const [messages, unread] = await Promise.all([
    findThread(
      registrationNo,
      facultyEmail,
      page === undefined ? undefined : page.limit + 1,
      page?.offset
    ),
    countUnread(registrationNo, facultyEmail, 'faculty'),
  ]);

  return { success: true, data: { messages, unread } };
}

export function listFacultyThreads(
  facultyEmail: string
): Promise<ThreadSummaryRow[]> {
  return findFacultyThreads(facultyEmail);
}

function validateBody(
  input: Record<string, unknown>
): Result<string, MessageErrorCode> {
  if (!isNonEmptyString(input.body)) {
    return { success: false, code: 'EMPTY_MESSAGE' };
  }
  const body = input.body.trim();
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { success: false, code: 'TOO_LONG' };
  }
  return { success: true, data: body };
}

/**
 * Sends a message.
 *
 * The recipient is derived from the sender's own assignment rather than taken
 * from the request, so a caller cannot direct a message at somebody they are
 * not paired with.
 */
export async function sendMessage(
  user: AuthTokenPayload,
  input: Record<string, unknown>
): Promise<Result<{ messageId: number }, MessageErrorCode>> {
  const body = validateBody(input);
  if (!body.success) return body;

  let studentId: string;
  let facultyEmail: string;
  const senderType: UserType = user.type;

  if (user.type === 'student') {
    const mentor = await mentorOf(user.registration_no);
    if (!mentor.success) return mentor;
    studentId = user.registration_no;
    facultyEmail = mentor.data;
  } else {
    const target = typeof input.student_id === 'string' ? input.student_id : '';
    const assigned = await assertAssigned(user.email, target);
    if (!assigned.success) return assigned;
    studentId = target;
    facultyEmail = user.email;
  }

  const messageId = await insertMessage({
    student_id: studentId,
    faculty_email: facultyEmail,
    sender_type: senderType,
    body: body.data,
  });

  return { success: true, data: { messageId } };
}

export async function markRead(
  user: AuthTokenPayload,
  registrationNo?: string
): Promise<Result<{ updated: number }, MessageErrorCode>> {
  if (user.type === 'student') {
    const mentor = await mentorOf(user.registration_no);
    if (!mentor.success) return mentor;
    const updated = await markThreadRead(
      user.registration_no,
      mentor.data,
      'student'
    );
    return { success: true, data: { updated } };
  }

  const target = registrationNo ?? '';
  const assigned = await assertAssigned(user.email, target);
  if (!assigned.success) return assigned;

  const updated = await markThreadRead(target, user.email, 'faculty');
  return { success: true, data: { updated } };
}
