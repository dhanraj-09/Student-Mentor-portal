import type { RowDataPacket } from 'mysql2/promise';
import type { UserType } from 'shared';
import { mutate, query, queryOne, withTransaction } from '../shared/index.js';

/**
 * Storage for the video call: the LiveKit room name, and the end-to-end
 * encryption key distribution.
 *
 * Everything here is either a public key or a ciphertext sealed to a public
 * key. No plaintext room key, and no private key, is ever written.
 */

export interface MeetingRoomRow extends RowDataPacket {
  meeting_id: number;
  student_id: string;
  faculty_email: string;
  status: string;
  room_name: string | null;
  e2ee_key_version: number;
}

export interface DeviceKeyRow extends RowDataPacket {
  user_type: UserType;
  user_id: string;
  public_key: string;
  fingerprint: string;
  updated_at: Date;
}

export interface KeyEnvelopeRow extends RowDataPacket {
  meeting_id: number;
  key_version: number;
  recipient_type: UserType;
  recipient_id: string;
  recipient_public_key: string;
  ephemeral_public_key: string;
  salt: string;
  iv: string;
  ciphertext: string;
  created_at: Date;
}

export interface KeyRequestRow extends RowDataPacket {
  meeting_id: number;
  requester_type: UserType;
  requester_id: string;
  device_public_key: string;
  fingerprint: string;
  created_at: Date;
}

export interface EnvelopeInput {
  recipient_type: UserType;
  recipient_id: string;
  recipient_public_key: string;
  ephemeral_public_key: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

/* -------------------------------------------------------------------------- */
/* Room                                                                        */
/* -------------------------------------------------------------------------- */

export function findMeetingRoom(
  meetingId: string
): Promise<MeetingRoomRow | null> {
  return queryOne<MeetingRoomRow>(
    `SELECT meeting_id, student_id, faculty_email, status, room_name, e2ee_key_version
     FROM meetings
     WHERE meeting_id = ?`,
    [meetingId]
  );
}

export interface ParticipantNamesRow extends RowDataPacket {
  student_name: string;
  faculty_name: string;
}

/** Display names for the two participants, used as the LiveKit identity label. */
export function findParticipantNames(
  studentId: string,
  facultyEmail: string
): Promise<ParticipantNamesRow | null> {
  return queryOne<ParticipantNamesRow>(
    `SELECT s.name AS student_name, f.name AS faculty_name
     FROM student s
     JOIN faculty f ON f.email = ?
     WHERE s.registration_no = ?`,
    [facultyEmail, studentId]
  );
}

/**
 * Claims a room name for a meeting that does not have one yet. The UPDATE is
 * conditional so two participants joining at the same moment cannot end up
 * with different rooms.
 */
export async function claimRoomName(
  meetingId: string,
  roomName: string
): Promise<string> {
  await mutate(
    `UPDATE meetings SET room_name = ? WHERE meeting_id = ? AND room_name IS NULL`,
    [roomName, meetingId]
  );
  const meeting = await findMeetingRoom(meetingId);
  return meeting?.room_name ?? roomName;
}

export async function setKeyVersion(
  meetingId: string,
  keyVersion: number
): Promise<void> {
  await mutate(
    `UPDATE meetings SET e2ee_key_version = ? WHERE meeting_id = ?`,
    [keyVersion, meetingId]
  );
}

/* -------------------------------------------------------------------------- */
/* Device keys                                                                 */
/* -------------------------------------------------------------------------- */

export async function upsertDeviceKey(
  userType: UserType,
  userId: string,
  publicKey: string,
  fingerprint: string
): Promise<void> {
  await mutate(
    `INSERT INTO e2ee_device_keys(user_type, user_id, public_key, fingerprint)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE public_key = VALUES(public_key),
                             fingerprint = VALUES(fingerprint)`,
    [userType, userId, publicKey, fingerprint]
  );
}

export function findDeviceKey(
  userType: UserType,
  userId: string
): Promise<DeviceKeyRow | null> {
  return queryOne<DeviceKeyRow>(
    `SELECT user_type, user_id, public_key, fingerprint, updated_at
     FROM e2ee_device_keys
     WHERE user_type = ? AND user_id = ?`,
    [userType, userId]
  );
}

/** Public keys of both participants of a meeting, for sealing the room key. */
export function findParticipantDeviceKeys(
  studentId: string,
  facultyEmail: string
): Promise<DeviceKeyRow[]> {
  return query<DeviceKeyRow>(
    `SELECT user_type, user_id, public_key, fingerprint, updated_at
     FROM e2ee_device_keys
     WHERE (user_type = 'student' AND user_id = ?)
        OR (user_type = 'faculty' AND user_id = ?)`,
    [studentId, facultyEmail]
  );
}

/* -------------------------------------------------------------------------- */
/* Sealed key envelopes                                                        */
/* -------------------------------------------------------------------------- */

export function findEnvelopeForRecipient(
  meetingId: string,
  keyVersion: number,
  recipientType: UserType,
  recipientId: string
): Promise<KeyEnvelopeRow | null> {
  return queryOne<KeyEnvelopeRow>(
    `SELECT meeting_id, key_version, recipient_type, recipient_id, recipient_public_key,
            ephemeral_public_key, salt, iv, ciphertext, created_at
     FROM e2ee_key_envelopes
     WHERE meeting_id = ? AND key_version = ? AND recipient_type = ? AND recipient_id = ?`,
    [meetingId, keyVersion, recipientType, recipientId]
  );
}

/**
 * Stores sealed envelopes and, for a rotation, promotes the meeting to the new
 * generation and drops the superseded one - all in one transaction so a
 * participant can never see a half-applied rotation.
 */
export function saveEnvelopes(
  meetingId: string,
  keyVersion: number,
  envelopes: readonly EnvelopeInput[],
  options: { rotate: boolean }
): Promise<void> {
  return withTransaction(async (connection) => {
    for (const envelope of envelopes) {
      await connection.query(
        `INSERT INTO e2ee_key_envelopes
           (meeting_id, key_version, recipient_type, recipient_id, recipient_public_key,
            ephemeral_public_key, salt, iv, ciphertext)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE recipient_public_key = VALUES(recipient_public_key),
                                 ephemeral_public_key = VALUES(ephemeral_public_key),
                                 salt = VALUES(salt),
                                 iv = VALUES(iv),
                                 ciphertext = VALUES(ciphertext),
                                 created_at = NOW()`,
        [
          meetingId,
          keyVersion,
          envelope.recipient_type,
          envelope.recipient_id,
          envelope.recipient_public_key,
          envelope.ephemeral_public_key,
          envelope.salt,
          envelope.iv,
          envelope.ciphertext,
        ]
      );
    }

    if (options.rotate) {
      await connection.query(
        `UPDATE meetings SET e2ee_key_version = ? WHERE meeting_id = ?`,
        [keyVersion, meetingId]
      );
      await connection.query(
        `DELETE FROM e2ee_key_envelopes WHERE meeting_id = ? AND key_version < ?`,
        [meetingId, keyVersion]
      );
    }

    // Anyone who has now been served no longer needs to wait for a key.
    for (const envelope of envelopes) {
      await connection.query(
        `DELETE FROM e2ee_key_requests
         WHERE meeting_id = ? AND requester_type = ? AND requester_id = ?`,
        [meetingId, envelope.recipient_type, envelope.recipient_id]
      );
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Key requests                                                                */
/* -------------------------------------------------------------------------- */

export async function upsertKeyRequest(
  meetingId: string,
  requesterType: UserType,
  requesterId: string,
  devicePublicKey: string,
  fingerprint: string
): Promise<void> {
  await mutate(
    `INSERT INTO e2ee_key_requests(meeting_id, requester_type, requester_id, device_public_key, fingerprint)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE device_public_key = VALUES(device_public_key),
                             fingerprint = VALUES(fingerprint),
                             created_at = NOW()`,
    [meetingId, requesterType, requesterId, devicePublicKey, fingerprint]
  );
}

export function findKeyRequests(meetingId: string): Promise<KeyRequestRow[]> {
  return query<KeyRequestRow>(
    `SELECT meeting_id, requester_type, requester_id, device_public_key, fingerprint, created_at
     FROM e2ee_key_requests
     WHERE meeting_id = ?
     ORDER BY created_at ASC`,
    [meetingId]
  );
}
