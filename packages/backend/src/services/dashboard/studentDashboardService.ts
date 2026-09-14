import type { StudentDashboard } from 'shared';
import { findQueriesByStudent } from '../../models/community/index.js';
import { findMeetingsByStudent } from '../../models/meetings/index.js';
import {
  findFacultyProfile,
  findStudentProfile,
} from '../../models/profile/index.js';
import type { Result } from '../../utils/helpers.js';
import { summariseMeetings, summariseQueries } from './dashboardStats.js';

export type DashboardErrorCode = 'NOT_FOUND';

const RECENT_QUERY_LIMIT = 5;
const UPCOMING_MEETING_LIMIT = 5;

/**
 * Composed from the existing per-feature finders rather than one bespoke
 * aggregate query: the row shapes are already proven by the endpoints that
 * serve them, and the volumes here are per-student, so the extra round trips
 * cost far less than a new hand-rolled join would risk.
 */
export async function getStudentDashboard(
  registrationNo: string
): Promise<Result<StudentDashboard, DashboardErrorCode>> {
  const student = await findStudentProfile(registrationNo);
  if (student === null) {
    return { success: false, code: 'NOT_FOUND' };
  }

  const [queries, meetings] = await Promise.all([
    findQueriesByStudent(registrationNo),
    findMeetingsByStudent(registrationNo),
  ]);

  const mentorEmail = student.assigned_faculty_email;
  const mentor =
    mentorEmail === null ? null : await findFacultyProfile(mentorEmail);

  return {
    success: true,
    data: {
      student: {
        registration_no: student.registration_no,
        name: student.name,
        degree: student.degree,
        branch: student.branch,
        year: student.year,
      },
      mentor:
        mentor === null
          ? null
          : {
              name: mentor.name,
              email: mentor.email,
              designation: mentor.designation,
              department: mentor.department,
            },
      queries: summariseQueries(queries),
      meetings: summariseMeetings(meetings),
      recentQueries: queries.slice(0, RECENT_QUERY_LIMIT),
      upcomingMeetings: meetings
        .filter(
          (meeting) =>
            meeting.status === 'accepted' || meeting.status === 'ongoing'
        )
        .slice(0, UPCOMING_MEETING_LIMIT),
    },
  };
}
