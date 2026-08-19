import { createHash } from 'node:crypto';
import type { AuthTokenPayload, UserType } from 'shared';
import {
  claimRoomName,
  findDeviceKey,
  findEnvelopeForRecipient,
  findKeyRequests,
  findMeetingRoom,
  findParticipantDeviceKeys,
  findParticipantNames,
  saveEnvelopes,
  upsertDeviceKey,
  upsertKeyRequest,
} from '../../models/meetings/index.js';
import type {
  DeviceKeyRow,
  EnvelopeInput,
  MeetingRoomRow,
} from '../../models/meetings/index.js';
import type { Result } from '../../utils/helpers.js';
import {
  createRoomToken,
  generateRoomName,
  isLiveKitConfigured,
} from './livekitService.js';
import type { MeetingErrorCode } from './studentMeetingsService.js';

/**
 * The video call for a meeting.
 *
 * The server authenticates the participant, decides whether they may join, and
 * mints a short-lived LiveKit token. It also relays the *sealed* end-to-end
 * encryption keys between the two participants' browsers - it stores ciphertext
 * and public keys only, and can never recover the key that protects the media.
 */

export type VideoRoomErrorCode =
  | MeetingErrorCode
  | 'LIVEKIT_UNAVAILABLE'
  | 'FACULTY_ONLY'
  | 'INVALID_KEY_MATERIAL'
  | 'E2EE_DEVICE_KEY_MISSING'
  | 'E2EE_KEY_UNAVAILABLE'
  | 'E2EE_STALE_DEVICE_KEY'
  | 'E2EE_VERSION_CONFLICT'
  | 'E2EE_ROTATION_INCOMPLETE';

/** Uncompressed P-256 SPKI keys are 91 bytes -> 124 base64 characters. */
const MIN_PUBLIC_KEY_LENGTH = 64;
const MAX_PUBLIC_KEY_LENGTH = 512;
const MAX_ENVELOPE_FIELD_LENGTH = 1024;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function isBase64(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.length % 4 === 0 &&
    BASE64.test(value)
  );
}

/** SHA-256 of the public key bytes, in readable groups. */
export function fingerprintOf(publicKeyBase64: string): string {
  const digest = createHash('sha256')
    .update(Buffer.from(publicKeyBase64, 'base64'))
    .digest('hex');
  return (digest.slice(0, 32).match(/.{4}/g) ?? []).join(' ');
}

function identityOf(user: AuthTokenPayload): string {
  return user.type === 'student' ? user.registration_no : user.email;
}

function participantRole(
  meeting: MeetingRoomRow,
  user: AuthTokenPayload
): UserType | null {
  if (user.type === 'student' && user.registration_no === meeting.student_id) {
    return 'student';
  }
  if (user.type === 'faculty' && user.email === meeting.faculty_email) {
    return 'faculty';
  }
  return null;
}

async function loadMeetingForParticipant(
  user: AuthTokenPayload,
  meetingId: string
): Promise<Result<MeetingRoomRow, VideoRoomErrorCode>> {
  const meeting = await findMeetingRoom(meetingId);
  if (meeting === null) {
    return { success: false, code: 'NOT_FOUND' };
  }
  if (participantRole(meeting, user) === null) {
    return { success: false, code: 'NOT_PARTICIPANT' };
  }
  return { success: true, data: meeting };
}

/* -------------------------------------------------------------------------- */
/* Device keys                                                                 */
/* -------------------------------------------------------------------------- */

export interface DeviceKeyView {
  user_type: UserType;
  user_id: string;
  public_key: string;
  fingerprint: string;
}

function toDeviceKeyView(row: DeviceKeyRow): DeviceKeyView {
  return {
    user_type: row.user_type,
    user_id: row.user_id,
    public_key: row.public_key,
    fingerprint: row.fingerprint,
  };
}

export async function registerDeviceKey(
  user: AuthTokenPayload,
  publicKey: unknown
): Promise<Result<DeviceKeyView, VideoRoomErrorCode>> {
  if (
    !isBase64(publicKey, MAX_PUBLIC_KEY_LENGTH) ||
    publicKey.length < MIN_PUBLIC_KEY_LENGTH
  ) {
    return {
      success: false,
      code: 'INVALID_KEY_MATERIAL',
      detail: 'publicKey must be a base64 encoded public key',
    };
  }

  const fingerprint = fingerprintOf(publicKey);
  await upsertDeviceKey(user.type, identityOf(user), publicKey, fingerprint);

  return {
    success: true,
    data: {
      user_type: user.type,
      user_id: identityOf(user),
      public_key: publicKey,
      fingerprint,
    },
  };
}

export async function getDeviceKey(
  user: AuthTokenPayload
): Promise<DeviceKeyView | null> {
  const row = await findDeviceKey(user.type, identityOf(user));
  return row === null ? null : toDeviceKeyView(row);
}

export async function listParticipantKeys(
  user: AuthTokenPayload,
  meetingId: string
): Promise<Result<DeviceKeyView[], VideoRoomErrorCode>> {
  const loaded = await loadMeetingForParticipant(user, meetingId);
  if (!loaded.success) return loaded;

  const rows = await findParticipantDeviceKeys(
    loaded.data.student_id,
    loaded.data.faculty_email
  );
  return { success: true, data: rows.map(toDeviceKeyView) };
}

/* -------------------------------------------------------------------------- */
/* Key distribution                                                            */
/* -------------------------------------------------------------------------- */

export interface KeyStateView {
  key_version: number;
  envelope: {
    key_version: number;
    ephemeral_public_key: string;
    salt: string;
    iv: string;
    ciphertext: string;
  } | null;
  pending_requests: {
    user_type: UserType;
    user_id: string;
    fingerprint: string;
  }[];
}

/**
 * What the caller's browser needs in order to decide whether it can join: the
 * current generation, its own sealed envelope, and any request it could serve.
 */
export async function getKeyState(
  user: AuthTokenPayload,
  meetingId: string
): Promise<Result<KeyStateView, VideoRoomErrorCode>> {
  const loaded = await loadMeetingForParticipant(user, meetingId);
  if (!loaded.success) return loaded;

  const meeting = loaded.data;
  const role = participantRole(meeting, user) as UserType;
  const identity = identityOf(user);

  const [deviceKey, envelope, requests] = await Promise.all([
    findDeviceKey(role, identity),
    meeting.e2ee_key_version > 0
      ? findEnvelopeForRecipient(
          meetingId,
          meeting.e2ee_key_version,
          role,
          identity
        )
      : Promise.resolve(null),
    findKeyRequests(meetingId),
  ]);

  // An envelope sealed to a previous device is useless to this browser.
  const usable =
    envelope !== null &&
    deviceKey !== null &&
    envelope.recipient_public_key === deviceKey.public_key
      ? {
          key_version: envelope.key_version,
          ephemeral_public_key: envelope.ephemeral_public_key,
          salt: envelope.salt,
          iv: envelope.iv,
          ciphertext: envelope.ciphertext,
        }
      : null;

  return {
    success: true,
    data: {
      key_version: meeting.e2ee_key_version,
      envelope: usable,
      pending_requests: requests
        .filter(
          (request) =>
            !(
              request.requester_type === role &&
              request.requester_id === identity
            )
        )
        .map((request) => ({
          user_type: request.requester_type,
          user_id: request.requester_id,
          fingerprint: request.fingerprint,
        })),
    },
  };
}

interface PublishEnvelopeInput {
  recipient_type?: unknown;
  recipient_id?: unknown;
  recipient_public_key?: unknown;
  ephemeral_public_key?: unknown;
  salt?: unknown;
  iv?: unknown;
  ciphertext?: unknown;
}

/**
 * Stores envelopes sealed by a participant.
 *
 * `key_version === current` serves a pending request for the live key;
 * `key_version === current + 1` rotates it, which only the mentor may do (or
 * either participant while the meeting has no key at all).
 */
export async function publishEnvelopes(
  user: AuthTokenPayload,
  meetingId: string,
  rawKeyVersion: unknown,
  rawEnvelopes: unknown
): Promise<Result<{ key_version: number }, VideoRoomErrorCode>> {
  const loaded = await loadMeetingForParticipant(user, meetingId);
  if (!loaded.success) return loaded;

  const meeting = loaded.data;
  const keyVersion = Number(rawKeyVersion);
  if (!Number.isInteger(keyVersion) || keyVersion < 1) {
    return {
      success: false,
      code: 'INVALID_KEY_MATERIAL',
      detail: 'key_version must be a positive integer',
    };
  }
  if (!Array.isArray(rawEnvelopes) || rawEnvelopes.length === 0) {
    return {
      success: false,
      code: 'INVALID_KEY_MATERIAL',
      detail: 'At least one envelope is required',
    };
  }

  const current = meeting.e2ee_key_version;
  const isRotation = keyVersion === current + 1;
  const isFulfilment = keyVersion === current && current > 0;

  if (!isRotation && !isFulfilment) {
    return {
      success: false,
      code: 'E2EE_VERSION_CONFLICT',
      detail: `Encryption key version ${keyVersion} is out of date; the meeting is on version ${current}`,
    };
  }
  if (isRotation && current > 0 && user.type !== 'faculty') {
    return { success: false, code: 'FACULTY_ONLY' };
  }

  const registered = await findParticipantDeviceKeys(
    meeting.student_id,
    meeting.faculty_email
  );
  const keyFor = new Map(
    registered.map((row) => [`${row.user_type}:${row.user_id}`, row.public_key])
  );

  const envelopes: EnvelopeInput[] = [];
  for (const raw of rawEnvelopes as PublishEnvelopeInput[]) {
    const recipientType = raw.recipient_type;
    const recipientId = raw.recipient_id;

    if (recipientType !== 'student' && recipientType !== 'faculty') {
      return { success: false, code: 'INVALID_KEY_MATERIAL' };
    }
    const belongsToMeeting =
      (recipientType === 'student' && recipientId === meeting.student_id) ||
      (recipientType === 'faculty' && recipientId === meeting.faculty_email);
    if (typeof recipientId !== 'string' || !belongsToMeeting) {
      return { success: false, code: 'NOT_PARTICIPANT' };
    }

    if (
      !isBase64(raw.recipient_public_key, MAX_PUBLIC_KEY_LENGTH) ||
      !isBase64(raw.ephemeral_public_key, MAX_PUBLIC_KEY_LENGTH) ||
      !isBase64(raw.salt, MAX_ENVELOPE_FIELD_LENGTH) ||
      !isBase64(raw.iv, MAX_ENVELOPE_FIELD_LENGTH) ||
      !isBase64(raw.ciphertext, MAX_ENVELOPE_FIELD_LENGTH)
    ) {
      return { success: false, code: 'INVALID_KEY_MATERIAL' };
    }

    const currentKey = keyFor.get(`${recipientType}:${recipientId}`);
    if (currentKey === undefined) {
      return { success: false, code: 'E2EE_DEVICE_KEY_MISSING' };
    }
    if (currentKey !== raw.recipient_public_key) {
      return { success: false, code: 'E2EE_STALE_DEVICE_KEY' };
    }

    envelopes.push({
      recipient_type: recipientType,
      recipient_id: recipientId,
      recipient_public_key: raw.recipient_public_key,
      ephemeral_public_key: raw.ephemeral_public_key,
      salt: raw.salt,
      iv: raw.iv,
      ciphertext: raw.ciphertext,
    });
  }

  if (isRotation) {
    // A rotation that skips a participant would silently lock them out.
    const sealedFor = new Set(
      envelopes.map(
        (envelope) => `${envelope.recipient_type}:${envelope.recipient_id}`
      )
    );
    const missing = [...keyFor.keys()].filter((key) => !sealedFor.has(key));
    if (missing.length > 0) {
      return {
        success: false,
        code: 'E2EE_ROTATION_INCOMPLETE',
        detail:
          'A new encryption key must be sealed for every participant that has a device key',
      };
    }
  }

  await saveEnvelopes(meetingId, keyVersion, envelopes, { rotate: isRotation });
  return { success: true, data: { key_version: keyVersion } };
}

/** Asks the other participant to seal the current room key for this browser. */
export async function requestKey(
  user: AuthTokenPayload,
  meetingId: string
): Promise<Result<{ requested: true }, VideoRoomErrorCode>> {
  const loaded = await loadMeetingForParticipant(user, meetingId);
  if (!loaded.success) return loaded;

  const deviceKey = await findDeviceKey(user.type, identityOf(user));
  if (deviceKey === null) {
    return { success: false, code: 'E2EE_DEVICE_KEY_MISSING' };
  }

  await upsertKeyRequest(
    meetingId,
    user.type,
    identityOf(user),
    deviceKey.public_key,
    deviceKey.fingerprint
  );
  return { success: true, data: { requested: true } };
}

/* -------------------------------------------------------------------------- */
/* Joining                                                                     */
/* -------------------------------------------------------------------------- */

export interface RoomAccessView {
  token: string;
  server_url: string;
  room_name: string;
  meeting_id: number;
  expires_at: string;
  participant: { identity: string; name: string; role: UserType };
  e2ee: { required: true; key_version: number };
}

/**
 * The protected path into a call:
 * authenticated -> participant -> meeting ongoing -> E2EE key in place -> token.
 */
export async function issueRoomToken(
  user: AuthTokenPayload,
  meetingId: string
): Promise<Result<RoomAccessView, VideoRoomErrorCode>> {
  const loaded = await loadMeetingForParticipant(user, meetingId);
  if (!loaded.success) return loaded;

  const meeting = loaded.data;
  const role = participantRole(meeting, user) as UserType;

  if (!isLiveKitConfigured()) {
    return {
      success: false,
      code: 'LIVEKIT_UNAVAILABLE',
      detail:
        'Video service is not configured on the server (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)',
    };
  }

  if (meeting.status !== 'ongoing') {
    return {
      success: false,
      code: 'INVALID_STATE',
      detail: `The call is available once the meeting is ongoing (current: ${meeting.status})`,
    };
  }

  // Fail closed: without a usable end-to-end encryption key there is no token.
  const identity = identityOf(user);
  const deviceKey = await findDeviceKey(role, identity);
  if (deviceKey === null) {
    return { success: false, code: 'E2EE_DEVICE_KEY_MISSING' };
  }
  if (meeting.e2ee_key_version < 1) {
    return { success: false, code: 'E2EE_KEY_UNAVAILABLE' };
  }
  const envelope = await findEnvelopeForRecipient(
    meetingId,
    meeting.e2ee_key_version,
    role,
    identity
  );
  if (envelope === null) {
    return { success: false, code: 'E2EE_KEY_UNAVAILABLE' };
  }
  if (envelope.recipient_public_key !== deviceKey.public_key) {
    return { success: false, code: 'E2EE_STALE_DEVICE_KEY' };
  }

  // The label shown to the other participant comes from the database, never
  // from the client.
  const names = await findParticipantNames(
    meeting.student_id,
    meeting.faculty_email
  );
  const displayName =
    role === 'student'
      ? (names?.student_name ?? meeting.student_id)
      : (names?.faculty_name ?? meeting.faculty_email);

  const roomName =
    meeting.room_name ??
    (await claimRoomName(meetingId, generateRoomName(meeting.meeting_id)));

  const access = await createRoomToken({
    roomName,
    identity,
    displayName,
  });

  return {
    success: true,
    data: {
      token: access.token,
      server_url: access.serverUrl,
      room_name: roomName,
      meeting_id: meeting.meeting_id,
      expires_at: access.expiresAt,
      participant: { identity, name: displayName, role },
      e2ee: { required: true, key_version: meeting.e2ee_key_version },
    },
  };
}
