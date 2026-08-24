import type { RowDataPacket } from 'mysql2/promise';
import type { MeetingRow } from '../../src/models/meetings/Meeting.js';
import type { QueryRow } from '../../src/models/community/Query.js';
import type { StudentProfileRow } from '../../src/models/profile/StudentProfile.js';
import type { FacultyProfileRow } from '../../src/models/profile/FacultyProfile.js';

/**
 * mysql2 rows are `RowDataPacket`s — plain objects with a non-enumerable
 * constructor tag. Tests only ever read fields, so a cast is enough and keeps
 * the fixtures readable.
 */
function asRow<T>(value: Omit<T, keyof RowDataPacket>): T {
  return value as T;
}

export const STUDENT_REGISTRATION_NO = '229301001';
export const FACULTY_EMAIL = 'mentor@example.edu';

/** bcrypt hash of 'correct-horse' at 10 rounds. */
export const KNOWN_PASSWORD = 'correct-horse';
export const KNOWN_PASSWORD_HASH =
  '$2a$10$2v0M5ccm3wuCAUNgqAlGsu6CKHD1bS65GLxt.XRsgGpTkbCDgjPFq';

export const studentProfile = (): StudentProfileRow =>
  asRow<StudentProfileRow>({
    registration_no: STUDENT_REGISTRATION_NO,
    name: 'Asha Nair',
    degree: 'B.Tech',
    branch: 'Information Technology',
    year: 3,
    gender: 'F',
    dob: new Date('2004-05-11T00:00:00Z'),
    linked_in: null,
    github: null,
    assigned_faculty_email: FACULTY_EMAIL,
  });

export const unassignedStudentProfile = (): StudentProfileRow =>
  asRow<StudentProfileRow>({
    ...studentProfile(),
    registration_no: '229301999',
    name: 'Ravi Kumar',
    assigned_faculty_email: null,
  });

export const facultyProfile = (): FacultyProfileRow =>
  asRow<FacultyProfileRow>({
    email: FACULTY_EMAIL,
    name: 'Dr. Meera Iyer',
    designation: 'Associate Professor',
    department: 'Information Technology',
    phone_number: null,
    linked_in: null,
    muj_page: null,
  });

/** `RowDataPacket` pins `constructor.name`, so overrides drop its members. */
export type RowOverrides<T> = Partial<Omit<T, keyof RowDataPacket>>;

export const queryRow = (overrides: RowOverrides<QueryRow> = {}): QueryRow =>
  asRow<QueryRow>({
    query_id: 1,
    student_id: STUDENT_REGISTRATION_NO,
    category: 'Academics',
    subcategory: 'Curriculum',
    subject: 'Elective choice',
    description: 'Which elective suits a systems track?',
    status: 'Pending',
    created_at: new Date('2026-08-01T10:00:00Z'),
    response: null,
    responded_at: null,
    ...overrides,
  });

export const meetingRow = (
  overrides: RowOverrides<MeetingRow> = {}
): MeetingRow =>
  asRow<MeetingRow>({
    meeting_id: 1,
    student_id: STUDENT_REGISTRATION_NO,
    student_name: 'Asha Nair',
    faculty_email: FACULTY_EMAIL,
    initiated_by: 'student',
    reason: 'Project review',
    status: 'pending',
    student_ready: 0,
    faculty_ready: 0,
    marks: null,
    created_at: new Date('2026-08-02T09:00:00Z'),
    completed_at: null,
    skills: null,
    ...overrides,
  });
