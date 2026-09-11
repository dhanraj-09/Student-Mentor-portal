import type { RowDataPacket } from 'mysql2/promise';
import type { MeetingInitiator, MeetingStatus } from 'shared';
import { mutate, query, queryOne, withTransaction } from '../shared/index.js';

export interface MeetingRow extends RowDataPacket {
  meeting_id: number;
  student_id: string;
  student_name?: string;
  faculty_email: string;
  initiated_by: MeetingInitiator;
  reason: string | null;
  status: MeetingStatus;
  student_ready: number;
  faculty_ready: number;
  marks: number | null;
  created_at: Date;
  completed_at: Date | null;
  skills?: string | null;
}

export interface SkillOptionRow extends RowDataPacket {
  skill_id: number;
  skill_name: string;
}

export function findSkillOptions(): Promise<SkillOptionRow[]> {
  return query<SkillOptionRow>(
    `SELECT skill_id, skill_name FROM meeting_skill_options ORDER BY skill_name ASC`
  );
}

export async function insertMeeting(
  studentId: string,
  facultyEmail: string,
  initiatedBy: MeetingInitiator,
  reason: string | null,
  status: MeetingStatus
): Promise<number> {
  const result = await mutate(
    `INSERT INTO meetings(student_id, faculty_email, initiated_by, reason, status)
     VALUES (?, ?, ?, ?, ?)`,
    [studentId, facultyEmail, initiatedBy, reason, status]
  );
  return result.insertId;
}

export function findMeetingsByFaculty(
  facultyEmail: string,
  limit?: number,
  offset = 0
): Promise<MeetingRow[]> {
  const bound = limit === undefined ? '' : ' LIMIT ? OFFSET ?';
  const params: unknown[] =
    limit === undefined ? [facultyEmail] : [facultyEmail, limit, offset];
  return query<MeetingRow>(
    `SELECT m.meeting_id, m.student_id, s.name AS student_name, m.faculty_email,
            m.initiated_by, m.reason, m.status, m.student_ready, m.faculty_ready,
            m.marks, m.created_at, m.completed_at,
            GROUP_CONCAT(mso.skill_name ORDER BY mso.skill_name SEPARATOR ', ') AS skills
     FROM meetings m
     JOIN student s ON m.student_id = s.registration_no
     LEFT JOIN meeting_skills ms ON m.meeting_id = ms.meeting_id
     LEFT JOIN meeting_skill_options mso ON ms.skill_id = mso.skill_id
     WHERE m.faculty_email = ?
     GROUP BY m.meeting_id, s.name
     ORDER BY FIELD(m.status, 'pending', 'accepted', 'ongoing', 'completed'), m.created_at DESC${bound}`,
    params
  );
}

export function findMeetingsByStudent(
  registrationNo: string,
  limit?: number,
  offset = 0
): Promise<MeetingRow[]> {
  const bound = limit === undefined ? '' : ' LIMIT ? OFFSET ?';
  const params: unknown[] =
    limit === undefined ? [registrationNo] : [registrationNo, limit, offset];
  return query<MeetingRow>(
    `SELECT meeting_id, student_id, faculty_email, initiated_by, reason, status,
            student_ready, faculty_ready, created_at, completed_at
     FROM meetings
     WHERE student_id = ?
     ORDER BY created_at DESC${bound}`,
    params
  );
}

export function findMeetingById(meetingId: string): Promise<MeetingRow | null> {
  return queryOne<MeetingRow>(
    `SELECT m.meeting_id, m.student_id, s.name AS student_name, m.faculty_email,
            m.initiated_by, m.reason, m.status, m.student_ready, m.faculty_ready,
            m.marks, m.created_at, m.completed_at
     FROM meetings m
     JOIN student s ON m.student_id = s.registration_no
     WHERE m.meeting_id = ?`,
    [meetingId]
  );
}

export function findMeetingOwnedByFaculty(
  meetingId: string,
  facultyEmail: string
): Promise<MeetingRow | null> {
  return queryOne<MeetingRow>(
    `SELECT meeting_id, status, student_ready, faculty_ready
     FROM meetings
     WHERE meeting_id = ? AND faculty_email = ?`,
    [meetingId, facultyEmail]
  );
}

export function findMeetingSkills(
  meetingId: string
): Promise<SkillOptionRow[]> {
  return query<SkillOptionRow>(
    `SELECT mso.skill_id, mso.skill_name
     FROM meeting_skills ms
     JOIN meeting_skill_options mso ON ms.skill_id = mso.skill_id
     WHERE ms.meeting_id = ?`,
    [meetingId]
  );
}

export async function updateMeetingStatus(
  meetingId: string,
  status: MeetingStatus
): Promise<void> {
  await mutate(`UPDATE meetings SET status = ? WHERE meeting_id = ?`, [
    status,
    meetingId,
  ]);
}

export async function updateReadiness(
  meetingId: string,
  party: 'student' | 'faculty',
  ready: boolean
): Promise<void> {
  // The column name is chosen from a fixed pair, never from user input.
  const column = party === 'student' ? 'student_ready' : 'faculty_ready';
  await mutate(`UPDATE meetings SET ${column} = ? WHERE meeting_id = ?`, [
    ready ? 1 : 0,
    meetingId,
  ]);
}

export function completeMeeting(
  meetingId: string,
  marks: number,
  skillIds: number[]
): Promise<void> {
  return withTransaction(async (connection) => {
    await connection.query(
      `UPDATE meetings SET status = 'completed', marks = ?, completed_at = NOW() WHERE meeting_id = ?`,
      [marks, meetingId]
    );

    const rows = skillIds.map((skillId) => [meetingId, skillId]);
    await connection.query(
      `INSERT INTO meeting_skills(meeting_id, skill_id) VALUES ?`,
      [rows]
    );
  });
}
