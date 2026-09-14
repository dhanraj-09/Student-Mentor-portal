import type { FacultyDashboard } from 'shared';
import { findQueriesByFaculty } from '../../models/community/index.js';
import { findMeetingsByFaculty } from '../../models/meetings/index.js';
import {
  findFacultyProfile,
  findStudentsByFaculty,
  findUnassignedStudents,
} from '../../models/profile/index.js';
import type { Result } from '../../utils/helpers.js';
import {
  averageMarks,
  summariseMeetings,
  summariseQueries,
} from './dashboardStats.js';
import type { DashboardErrorCode } from './studentDashboardService.js';

const PENDING_QUERY_LIMIT = 5;
const ACTIONABLE_MEETING_LIMIT = 5;

export async function getFacultyDashboard(
  facultyEmail: string
): Promise<Result<FacultyDashboard, DashboardErrorCode>> {
  const faculty = await findFacultyProfile(facultyEmail);
  if (faculty === null) {
    return { success: false, code: 'NOT_FOUND' };
  }

  const [queries, meetings, assigned, unassigned] = await Promise.all([
    findQueriesByFaculty(facultyEmail),
    findMeetingsByFaculty(facultyEmail),
    findStudentsByFaculty(facultyEmail),
    findUnassignedStudents(),
  ]);

  return {
    success: true,
    data: {
      faculty: {
        name: faculty.name,
        email: faculty.email,
        designation: faculty.designation,
        department: faculty.department,
      },
      students: { assigned: assigned.length, unassigned: unassigned.length },
      queries: summariseQueries(queries),
      meetings: summariseMeetings(meetings),
      averageMarks: averageMarks(meetings),
      pendingQueries: queries
        .filter((query) => query.status === 'Pending')
        .slice(0, PENDING_QUERY_LIMIT),
      // `findMeetingsByFaculty` already orders pending -> accepted -> ongoing
      // -> completed, so the requests needing a decision surface first.
      actionableMeetings: meetings
        .filter(
          (meeting) =>
            meeting.status === 'pending' || meeting.status === 'ongoing'
        )
        .slice(0, ACTIONABLE_MEETING_LIMIT),
    },
  };
}
