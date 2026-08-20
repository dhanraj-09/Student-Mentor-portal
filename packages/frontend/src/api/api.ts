import axios from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type {
  Faculty,
  FacultyDashboard,
  FacultyLoginResponse,
  MeetingSkillOption,
  MessageResponse,
  Query,
  QueryStatus,
  RefreshTokenResponse,
  Resource,
  ResourceInput,
  Student,
  StudentDashboard,
  StudentLoginResponse,
  UserType,
} from 'shared';
import type {
  DeviceKeyView,
  EnvelopePayload,
  FacultyMeeting,
  MeetingDetail,
  MeetingKeyState,
  RoomAccess,
  StudentMeeting,
} from '../types/meetings';

const URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token ?? null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const apiClient = axios.create({
  baseURL: URL,
  withCredentials: true,
});

apiClient.interceptors.request.use(
  (config) => {
    if (accessToken !== null) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

function clearClientSession(): void {
  accessToken = null;
  sessionStorage.removeItem('studentSessionID');
  sessionStorage.removeItem('facultyEmail');
}

// The active role for this tab, derived from the session identifier stored at
// login. Drives the role-scoped refresh/logout endpoints so a student tab and a
// faculty tab never touch each other's cookie.
function getActiveRole(): UserType | null {
  if (sessionStorage.getItem('studentSessionID') !== null) return 'student';
  if (sessionStorage.getItem('facultyEmail') !== null) return 'faculty';
  return null;
}

const LOGIN_PATHS: Record<UserType, string> = {
  student: '/',
  faculty: '/faculty-login',
};

/**
 * Sends an expired session back to the form it came from.
 *
 * Landing everyone on the student login left a mentor typing their email into
 * a field that looks up registration numbers, which can only ever answer
 * "Invalid credentials" — with no link anywhere to the faculty form.
 */
function redirectToLogin(role: UserType | null): void {
  const target = role === null ? '/' : LOGIN_PATHS[role];
  if (window.location.pathname !== target) {
    window.location.href = target;
  }
}

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise === null) {
    const role = getActiveRole();
    if (role === null) {
      return Promise.reject(new Error('No active session'));
    }
    refreshPromise = axios
      .post<RefreshTokenResponse>(
        `${URL}/auth/refresh-token/${role}`,
        {},
        { withCredentials: true }
      )
      .then(({ data }) => {
        accessToken = data.accessToken;
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    if (
      status === 401 &&
      original !== undefined &&
      original._retry !== true &&
      original.url?.includes('/auth/') !== true
    ) {
      original._retry = true;
      try {
        const newToken = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${newToken}`;
        return await apiClient(original);
      } catch (refreshError) {
        // Read the role before clearing it: the session is what identifies
        // which login form to return to.
        const role = getActiveRole();
        clearClientSession();
        redirectToLogin(role);
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? fallback;
  }
  return fallback;
}

export function hasStatus(error: unknown, status: number): boolean {
  return axios.isAxiosError(error) && error.response?.status === status;
}

export async function initAuth(): Promise<boolean> {
  try {
    await refreshAccessToken();
    return true;
  } catch {
    return false;
  }
}

export interface StudentSignupForm {
  name: string;
  registration_no: string;
  degree: string;
  branch: string;
  year: string;
  gender: string;
  dob: string;
  linked_in: string;
  github: string;
  password: string;
}

export interface FacultySignupForm {
  name: string;
  email: string;
  designation: string;
  department: string;
  phone_number: string;
  linked_in: string;
  muj_page: string;
  password: string;
}

export interface StudentProfileForm {
  registration_no: string;
  name: string;
  degree: string;
  branch: string;
  year: string;
  gender: string;
  dob: string;
  linked_in: string;
  github: string;
}

export interface NewQueryPayload {
  student_id: string;
  category: string;
  subcategory: string;
  subject: string;
  description: string;
}

export async function loginStudent(
  registration_no: string,
  password: string
): Promise<AxiosResponse<StudentLoginResponse>> {
  const res = await apiClient.post<StudentLoginResponse>(
    '/auth/login-student',
    {
      registration_no,
      password,
    }
  );
  setAccessToken(res.data.accessToken);
  sessionStorage.setItem('studentSessionID', registration_no);
  // Keep this tab single-role so getActiveRole() is unambiguous.
  sessionStorage.removeItem('facultyEmail');
  return res;
}

export async function loginFaculty(
  email: string,
  password: string
): Promise<AxiosResponse<FacultyLoginResponse>> {
  const res = await apiClient.post<FacultyLoginResponse>(
    '/auth/login-faculty',
    {
      email,
      password,
    }
  );
  setAccessToken(res.data.accessToken);
  sessionStorage.setItem('facultyEmail', email);
  sessionStorage.removeItem('studentSessionID');
  return res;
}

export function registerStudent(
  studentData: StudentSignupForm
): Promise<AxiosResponse<MessageResponse>> {
  return apiClient.post<MessageResponse>('/auth/register-student', studentData);
}

export function registerFaculty(
  facultyData: FacultySignupForm
): Promise<AxiosResponse<MessageResponse>> {
  return apiClient.post<MessageResponse>('/auth/register-faculty', facultyData);
}

export async function logout(): Promise<void> {
  const role = getActiveRole();
  if (role !== null) {
    await apiClient.post(`/auth/logout/${role}`).catch(() => undefined);
  }
  clearClientSession();
}

export function getStudentData(
  registration_no: string
): Promise<AxiosResponse<Student>> {
  return apiClient.get<Student>(`/api/student/${registration_no}`);
}

export function updateStudentData(
  registration_no: string,
  updatedData: StudentProfileForm
): Promise<AxiosResponse<MessageResponse>> {
  return apiClient.put<MessageResponse>(
    `/api/student/${registration_no}`,
    updatedData
  );
}

export function getStudentQueries(
  registration_no: string
): Promise<AxiosResponse<Query[]>> {
  return apiClient.get<Query[]>(`/api/student/${registration_no}/queries`);
}

export function createQuery(
  queryData: NewQueryPayload
): Promise<AxiosResponse<{ message: string; queryId: number }>> {
  return apiClient.post<{ message: string; queryId: number }>(
    '/api/queries',
    queryData
  );
}

export async function registrationNoExists(
  registration_no: string
): Promise<boolean> {
  try {
    const response = await getStudentData(registration_no);
    return response.status === 200;
  } catch (error) {
    if (hasStatus(error, 404)) {
      return false;
    }
    throw error;
  }
}

export function getFacultyData(email: string): Promise<AxiosResponse<Faculty>> {
  return apiClient.get<Faculty>(`/api/faculty/${email}`);
}

export function getFacultyQueries(
  email: string
): Promise<AxiosResponse<Query[]>> {
  return apiClient.get<Query[]>(`/api/faculty/${email}/queries`);
}

export function getAssignedStudents(): Promise<AxiosResponse<Student[]>> {
  return apiClient.get<Student[]>('/api/faculty/get-student');
}

export function assignStudentToFaculty(
  registration_no: string,
  email: string
): Promise<AxiosResponse<MessageResponse>> {
  return apiClient.put<MessageResponse>('/api/faculty/assign-student', {
    registration_no,
    email,
  });
}

export function getAllUnassignedStudents(): Promise<AxiosResponse<Student[]>> {
  return apiClient.get<Student[]>('/api/student/unassigned');
}

export function respondToQuery(
  queryId: number,
  payload: { response: string; status: QueryStatus }
): Promise<AxiosResponse<MessageResponse>> {
  return apiClient.put<MessageResponse>(
    `/api/queries/${queryId}/respond`,
    payload
  );
}

export function getMeetingSkillOptions(): Promise<
  AxiosResponse<MeetingSkillOption[]>
> {
  return apiClient.get<MeetingSkillOption[]>('/api/meeting-skill-options');
}

export function getFacultyMeetings(): Promise<AxiosResponse<FacultyMeeting[]>> {
  return apiClient.get<FacultyMeeting[]>('/api/faculty/meetings');
}

export function createMeeting(
  student_id: string,
  reason: string
): Promise<AxiosResponse<{ message: string; meetingId: number }>> {
  return apiClient.post<{ message: string; meetingId: number }>(
    '/api/meetings/create',
    {
      student_id,
      reason,
    }
  );
}

export function acceptMeeting(
  meetingId: number
): Promise<AxiosResponse<MessageResponse>> {
  return apiClient.put<MessageResponse>(
    `/api/meetings/${meetingId}/accept`,
    {}
  );
}

export function setMeetingReady(
  meetingId: number,
  ready = true
): Promise<AxiosResponse<MessageResponse>> {
  return apiClient.put<MessageResponse>(`/api/meetings/${meetingId}/ready`, {
    ready,
  });
}

export function startMeeting(
  meetingId: number
): Promise<AxiosResponse<MessageResponse>> {
  return apiClient.put<MessageResponse>(`/api/meetings/${meetingId}/start`, {});
}

export function completeMeeting(
  meetingId: number,
  marks: number,
  skills: number[]
): Promise<AxiosResponse<MessageResponse>> {
  return apiClient.put<MessageResponse>(`/api/meetings/${meetingId}/complete`, {
    marks,
    skills,
  });
}

export function getMeetingDetail(
  meetingId: number
): Promise<AxiosResponse<MeetingDetail>> {
  return apiClient.get<MeetingDetail>(`/api/meetings/${meetingId}`);
}

export function requestMeeting(
  student_id: string,
  reason: string
): Promise<AxiosResponse<{ message: string; meetingId: number }>> {
  return apiClient.post<{ message: string; meetingId: number }>(
    '/api/meetings/request',
    {
      student_id,
      reason,
    }
  );
}

export function getStudentMeetings(
  registration_no: string
): Promise<AxiosResponse<StudentMeeting[]>> {
  return apiClient.get<StudentMeeting[]>(
    `/api/student/${registration_no}/meetings`
  );
}

/* -------------------------------------------------------------------------- */
/* Video call                                                                  */
/*                                                                             */
/* These endpoints move *sealed* key material around. The room key itself is   */
/* never part of any payload: it is sealed in the browser and can only be      */
/* opened by the recipient's device.                                           */
/* -------------------------------------------------------------------------- */

export function registerDeviceKey(
  public_key: string
): Promise<AxiosResponse<DeviceKeyView>> {
  return apiClient.post<DeviceKeyView>('/api/meetings/e2ee/device-key', {
    public_key,
  });
}

export function getMyDeviceKey(): Promise<AxiosResponse<DeviceKeyView | null>> {
  return apiClient.get<DeviceKeyView | null>('/api/meetings/e2ee/device-key');
}

export function getParticipantKeys(
  meetingId: number
): Promise<AxiosResponse<DeviceKeyView[]>> {
  return apiClient.get<DeviceKeyView[]>(
    `/api/meetings/${meetingId}/room/participant-keys`
  );
}

export function getMeetingKeyState(
  meetingId: number
): Promise<AxiosResponse<MeetingKeyState>> {
  return apiClient.get<MeetingKeyState>(`/api/meetings/${meetingId}/room/keys`);
}

export function publishMeetingKeys(
  meetingId: number,
  key_version: number,
  envelopes: EnvelopePayload[]
): Promise<AxiosResponse<{ key_version: number }>> {
  return apiClient.post<{ key_version: number }>(
    `/api/meetings/${meetingId}/room/keys`,
    { key_version, envelopes }
  );
}

export function requestMeetingKey(
  meetingId: number
): Promise<AxiosResponse<MessageResponse>> {
  return apiClient.post<MessageResponse>(
    `/api/meetings/${meetingId}/room/key-requests`,
    {}
  );
}

/** Short-lived LiveKit token. Refused unless the caller holds a key envelope. */
export function getRoomAccess(
  meetingId: number
): Promise<AxiosResponse<RoomAccess>> {
  return apiClient.post<RoomAccess>(
    `/api/meetings/${meetingId}/room/token`,
    {}
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboards                                                                  */
/*                                                                             */
/* One request per dashboard: the aggregate is assembled server-side, so these  */
/* replace the profile + queries + meetings fan-out the screens used to do.     */
/* -------------------------------------------------------------------------- */

export function getStudentDashboard(): Promise<
  AxiosResponse<StudentDashboard>
> {
  return apiClient.get<StudentDashboard>('/api/dashboard/student');
}

export function getFacultyDashboard(): Promise<
  AxiosResponse<FacultyDashboard>
> {
  return apiClient.get<FacultyDashboard>('/api/dashboard/faculty');
}

/* -------------------------------------------------------------------------- */
/* Resources                                                                   */
/* -------------------------------------------------------------------------- */

export function getFacultyResources(
  email: string
): Promise<AxiosResponse<Resource[]>> {
  return apiClient.get<Resource[]>(`/api/faculty/${email}/resources`);
}

export function getStudentResources(
  registration_no: string
): Promise<AxiosResponse<Resource[]>> {
  return apiClient.get<Resource[]>(`/api/student/${registration_no}/resources`);
}

export function createResource(
  payload: ResourceInput
): Promise<AxiosResponse<{ message: string; resourceId: number }>> {
  return apiClient.post<{ message: string; resourceId: number }>(
    '/api/resources',
    payload
  );
}

export function updateResource(
  resourceId: number,
  payload: ResourceInput
): Promise<AxiosResponse<MessageResponse>> {
  return apiClient.put<MessageResponse>(
    `/api/resources/${resourceId}`,
    payload
  );
}

export function deleteResource(
  resourceId: number
): Promise<AxiosResponse<MessageResponse>> {
  return apiClient.delete<MessageResponse>(`/api/resources/${resourceId}`);
}
