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
