import type { Meeting, MeetingSkillOption } from 'shared';

export interface FacultyMeeting extends Omit<Meeting, 'skills'> {
  student_name: string;
  marks: number | null;
  skills: string | null;
}

export type StudentMeeting = Omit<Meeting, 'skills' | 'marks' | 'student_name'>;

export interface MeetingDetail extends Omit<Meeting, 'skills'> {
  skills: MeetingSkillOption[];
}
