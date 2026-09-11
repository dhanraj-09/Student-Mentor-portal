import type { RowDataPacket } from 'mysql2/promise';
import type { UserType } from 'shared';
import { mutate, query, queryOne } from '../shared/index.js';

export interface MessageRow extends RowDataPacket {
  message_id: number;
  student_id: string;
  faculty_email: string;
  sender_type: UserType;
  body: string;
  created_at: Date;
  read_at: Date | null;
}

export interface NewMessage {
  student_id: string;
  faculty_email: string;
  sender_type: UserType;
  body: string;
}

const MESSAGE_COLUMNS = `message_id, student_id, faculty_email, sender_type, body, created_at, read_at`;

/**
 * One conversation, newest first.
 *
 * Both sides of the pair are bound, so a caller cannot widen the thread to
 * somebody else's conversation by varying one of them.
 */
export function findThread(
  studentId: string,
  facultyEmail: string,
  limit?: number,
  offset = 0
): Promise<MessageRow[]> {
  const bound = limit === undefined ? '' : ' LIMIT ? OFFSET ?';
  const params: unknown[] =
    limit === undefined
      ? [studentId, facultyEmail]
      : [studentId, facultyEmail, limit, offset];
  return query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS}
     FROM messages
     WHERE student_id = ? AND faculty_email = ?
     ORDER BY created_at DESC, message_id DESC${bound}`,
    params
  );
}

export async function insertMessage(message: NewMessage): Promise<number> {
  const result = await mutate(
    `INSERT INTO messages(student_id, faculty_email, sender_type, body)
     VALUES (?, ?, ?, ?)`,
    [
      message.student_id,
      message.faculty_email,
      message.sender_type,
      message.body,
    ]
  );
  return result.insertId;
}

/**
 * Marks everything the *other* side wrote as read.
 *
 * Scoped by sender so opening a thread never marks your own messages read,
 * which would make the unread count meaningless for the recipient.
 */
export async function markThreadRead(
  studentId: string,
  facultyEmail: string,
  reader: UserType
): Promise<number> {
  const otherSide: UserType = reader === 'student' ? 'faculty' : 'student';
  const result = await mutate(
    `UPDATE messages SET read_at = NOW()
     WHERE student_id = ? AND faculty_email = ? AND sender_type = ? AND read_at IS NULL`,
    [studentId, facultyEmail, otherSide]
  );
  return result.affectedRows;
}

export interface UnreadCountRow extends RowDataPacket {
  unread: number;
}

export async function countUnread(
  studentId: string,
  facultyEmail: string,
  reader: UserType
): Promise<number> {
  const otherSide: UserType = reader === 'student' ? 'faculty' : 'student';
  const row = await queryOne<UnreadCountRow>(
    `SELECT COUNT(*) AS unread
     FROM messages
     WHERE student_id = ? AND faculty_email = ? AND sender_type = ? AND read_at IS NULL`,
    [studentId, facultyEmail, otherSide]
  );
  return row?.unread ?? 0;
}

export interface ThreadSummaryRow extends RowDataPacket {
  student_id: string;
  student_name: string;
  last_body: string | null;
  last_at: Date | null;
  unread: number;
}

/**
 * A mentor's conversations, one row per assigned student.
 *
 * Driven from `student` rather than `messages` so a student who has never
 * written still appears — otherwise a mentor could not start a conversation.
 */
export function findFacultyThreads(
  facultyEmail: string
): Promise<ThreadSummaryRow[]> {
  return query<ThreadSummaryRow>(
    `SELECT s.registration_no AS student_id,
            s.name           AS student_name,
            (SELECT m.body FROM messages m
              WHERE m.student_id = s.registration_no AND m.faculty_email = ?
              ORDER BY m.created_at DESC, m.message_id DESC LIMIT 1) AS last_body,
            (SELECT m.created_at FROM messages m
              WHERE m.student_id = s.registration_no AND m.faculty_email = ?
              ORDER BY m.created_at DESC, m.message_id DESC LIMIT 1) AS last_at,
            (SELECT COUNT(*) FROM messages m
              WHERE m.student_id = s.registration_no AND m.faculty_email = ?
                AND m.sender_type = 'student' AND m.read_at IS NULL) AS unread
     FROM student s
     WHERE s.assigned_faculty_email = ?
     ORDER BY last_at IS NULL, last_at DESC, s.name ASC`,
    [facultyEmail, facultyEmail, facultyEmail, facultyEmail]
  );
}
