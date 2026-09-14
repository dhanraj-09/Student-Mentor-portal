import type { Meeting, MeetingSkillOption, UserType } from 'shared';

export interface FacultyMeeting extends Omit<Meeting, 'skills'> {
  student_name: string;
  marks: number | null;
  skills: string | null;
}

export type StudentMeeting = Omit<Meeting, 'skills' | 'marks' | 'student_name'>;

export interface MeetingDetail extends Omit<Meeting, 'skills'> {
  skills: MeetingSkillOption[];
}

/* -------------------------------------------------------------------------- */
/* Video call                                                                  */
/* -------------------------------------------------------------------------- */

export interface DeviceKeyView {
  user_type: UserType;
  user_id: string;
  public_key: string;
  fingerprint: string;
}

export interface SealedEnvelopeView {
  key_version: number;
  ephemeral_public_key: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface MeetingKeyState {
  key_version: number;
  /** Sealed to this browser's device key; null while waiting for one. */
  envelope: SealedEnvelopeView | null;
  pending_requests: {
    user_type: UserType;
    user_id: string;
    fingerprint: string;
  }[];
}

export interface EnvelopePayload {
  recipient_type: UserType;
  recipient_id: string;
  recipient_public_key: string;
  ephemeral_public_key: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

/** Short-lived LiveKit access, minted by the backend. */
export interface RoomAccess {
  token: string;
  server_url: string;
  room_name: string;
  meeting_id: number;
  expires_at: string;
  participant: { identity: string; name: string; role: UserType };
  e2ee: { required: boolean; key_version: number };
}
