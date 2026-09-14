export type DateLike = string | Date;

export type UserType = 'student' | 'faculty';

export type QueryStatus = 'Pending' | 'Resolved';

export type MeetingStatus = 'pending' | 'accepted' | 'ongoing' | 'completed';

export type MeetingInitiator = 'student' | 'faculty';

export interface Student {
  registration_no: string;
  name: string;
  degree: string | null;
  branch: string | null;
  year: number | null;
  gender: string | null;
  dob: DateLike | null;
  linked_in: string | null;
  github: string | null;
  assigned_faculty_email?: string | null;
}

export interface Faculty {
  name: string;
  email: string;
  designation: string | null;
  department: string | null;
  phone_number: string | null;
  linked_in: string | null;
  muj_page: string | null;
}

export interface Query {
  query_id: number;
  student_id: string;
  category: string;
  subcategory: string;
  subject: string;
  description: string;
  status: QueryStatus;
  created_at: DateLike;
  response?: string | null;
  responded_at?: DateLike | null;
}

export interface Meeting {
  meeting_id: number;
  student_id: string;
  student_name?: string;
  faculty_email: string;
  initiated_by: MeetingInitiator;
  reason: string | null;
  status: MeetingStatus;
  student_ready: boolean | number;
  faculty_ready: boolean | number;
  marks?: number | null;
  created_at: DateLike;
  completed_at?: DateLike | null;
  skills?: string | MeetingSkillOption[] | null;
}

export interface MeetingSkillOption {
  skill_id: number;
  skill_name: string;
}

export interface StudentTokenPayload {
  registration_no: string;
  type: 'student';
  iat?: number;
  exp?: number;
}

export interface FacultyTokenPayload {
  email: string;
  type: 'faculty';
  iat?: number;
  exp?: number;
}

export type AuthTokenPayload = StudentTokenPayload | FacultyTokenPayload;

export interface StudentLoginRequest {
  registration_no: string;
  password: string;
}

export interface FacultyLoginRequest {
  email: string;
  password: string;
}

export interface StudentRegisterRequest extends Omit<
  Student,
  'assigned_faculty_email'
> {
  password: string;
}

export interface FacultyRegisterRequest extends Faculty {
  password: string;
}

export interface StudentLoginResponse {
  message: string;
  accessToken: string;
  student: Pick<Student, 'registration_no' | 'name'>;
}

export interface FacultyLoginResponse {
  message: string;
  accessToken: string;
  faculty: Pick<Faculty, 'email' | 'name'>;
}

export interface RefreshTokenResponse {
  accessToken: string;
}

export interface MessageResponse {
  message: string;
}

export interface ErrorResponse {
  error: string;
}

export interface CreateQueryRequest {
  student_id: string;
  category: string;
  subcategory: string;
  subject: string;
  description: string;
}

export interface RespondToQueryRequest {
  response: string;
  status?: QueryStatus;
}

export interface CompleteMeetingRequest {
  marks: number;
  skills: number[];
}

/* -------------------------------------------------------------------------- */
/* Dashboards                                                                  */
/*                                                                             */
/* Aggregates assembled server-side so a dashboard screen costs one request    */
/* instead of fanning out across the profile, query and meeting endpoints.     */
/* -------------------------------------------------------------------------- */

export interface QueryStats {
  total: number;
  pending: number;
  resolved: number;
}

export interface MeetingStats {
  total: number;
  pending: number;
  accepted: number;
  ongoing: number;
  completed: number;
}

export type StudentSummary = Pick<
  Student,
  'registration_no' | 'name' | 'degree' | 'branch' | 'year'
>;

export type FacultySummary = Pick<
  Faculty,
  'name' | 'email' | 'designation' | 'department'
>;

export interface StudentDashboard {
  student: StudentSummary;
  mentor: FacultySummary | null;
  queries: QueryStats;
  meetings: MeetingStats;
  recentQueries: Query[];
  /** Accepted or ongoing, soonest first. */
  upcomingMeetings: Meeting[];
}

export interface FacultyDashboard {
  faculty: FacultySummary;
  students: {
    assigned: number;
    unassigned: number;
  };
  queries: QueryStats;
  meetings: MeetingStats;
  /**
   * Mean marks this mentor has awarded across completed meetings, or null
   * before the first one. Faculty-side only: the student meeting list omits
   * `marks` by design, so it is deliberately absent from StudentDashboard.
   */
  averageMarks: number | null;
  /** Awaiting a response from this mentor. */
  pendingQueries: Query[];
  /** Meeting requests to accept, plus calls already running. */
  actionableMeetings: Meeting[];
}

/* -------------------------------------------------------------------------- */
/* Resources                                                                   */
/* -------------------------------------------------------------------------- */

export interface Resource {
  resource_id: number;
  faculty_email: string;
  title: string;
  description: string | null;
  url: string | null;
  category: string | null;
  created_at: DateLike;
  updated_at: DateLike;
}

export interface ResourceInput {
  title: string;
  description?: string | null;
  url?: string | null;
  category?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One page of a list endpoint.
 *
 * `hasMore` rather than a total count: the server fetches one row beyond the
 * page to answer it, which avoids a second COUNT query over the same table.
 */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/* -------------------------------------------------------------------------- */
/* Direct messages                                                             */
/*                                                                             */
/* Unlike the in-call chat, which rides the meeting's end-to-end encrypted     */
/* data channel, these are stored on the server and readable by whoever        */
/* operates it. The UI states that rather than implying otherwise.             */
/* -------------------------------------------------------------------------- */

export interface DirectMessage {
  message_id: number;
  student_id: string;
  faculty_email: string;
  sender_type: UserType;
  body: string;
  created_at: DateLike;
  read_at: DateLike | null;
}

export interface MessageThread extends Page<DirectMessage> {
  unread: number;
}

export interface ThreadSummary {
  student_id: string;
  student_name: string;
  last_body: string | null;
  last_at: DateLike | null;
  unread: number;
}
