import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getApiErrorMessage,
  getMeetingKeyState,
  getMyDeviceKey,
  getParticipantKeys,
  publishMeetingKeys,
  registerDeviceKey,
  requestMeetingKey,
} from '../api/api';
import type { DeviceKeyView, EnvelopePayload } from '../types/meetings';
import { getDeviceKey } from '../utils/deviceKeys';
import type { StoredDeviceKey } from '../utils/deviceKeys';
import { generateRoomKey, openRoomKey, sealRoomKey } from '../utils/e2ee';

/**
 * Owns the end-to-end encryption key for one meeting call.
 *
 * The first participant to open the call creates the room key and seals it for
 * both mentor and student. A participant that has no key asks for one, and any
 * browser holding the key serves that request. The call can only start once
 * `phase` is `ready`: there is no unencrypted fallback.
 */

export type RoomKeyPhase = 'preparing' | 'ready' | 'awaiting-key' | 'error';

const AWAITING_POLL_MS = 4000;
const HOLDER_POLL_MS = 8000;

export interface UseRoomKeyResult {
  phase: RoomKeyPhase;
  keyVersion: number;
  roomKey: Uint8Array | null;
  fingerprint: string | null;
  error: string;
  pendingRequests: number;
  retry: () => void;
  rotate: () => Promise<void>;
  refresh: () => Promise<void>;
}

async function sealFor(
  recipients: DeviceKeyView[],
  roomKey: Uint8Array,
  meetingId: number,
  keyVersion: number
): Promise<EnvelopePayload[]> {
  return Promise.all(
    recipients.map(async (recipient) => {
      const sealed = await sealRoomKey({
        roomKey,
        recipientPublicKey: recipient.public_key,
        meetingId,
        keyVersion,
      });
      return {
        recipient_type: recipient.user_type,
        recipient_id: recipient.user_id,
        recipient_public_key: recipient.public_key,
        ...sealed,
      };
    })
  );
}

export function useRoomKey(meetingId: number | null): UseRoomKeyResult {
  const [phase, setPhase] = useState<RoomKeyPhase>('preparing');
  const [keyVersion, setKeyVersion] = useState(0);
  const [roomKey, setRoomKey] = useState<Uint8Array | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pendingRequests, setPendingRequests] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const deviceRef = useRef<StoredDeviceKey | null>(null);
  const roomKeyRef = useRef<Uint8Array | null>(null);
  const keyVersionRef = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applyKey = useCallback((key: Uint8Array, version: number): void => {
    roomKeyRef.current = key;
    keyVersionRef.current = version;
    setRoomKey(key);
    setKeyVersion(version);
    setPhase('ready');
    setError('');
  }, []);

  /** Makes sure the backend knows this browser's current public key. */
  const ensureDevice = useCallback(async (): Promise<StoredDeviceKey> => {
    const device = await getDeviceKey();
    deviceRef.current = device;
    setFingerprint(device.fingerprint);

    const registered = await getMyDeviceKey();
    if (registered.data?.public_key !== device.publicKeyBase64) {
      await registerDeviceKey(device.publicKeyBase64);
    }
    return device;
  }, []);

  /* Initial acquisition. */
  useEffect(() => {
    if (meetingId === null) return;
    let cancelled = false;

    const acquire = async (): Promise<void> => {
      setPhase('preparing');
      setError('');

      const device = await ensureDevice();
      const state = await getMeetingKeyState(meetingId);
      if (cancelled || !mounted.current) return;

      if (state.data.envelope !== null) {
        const key = await openRoomKey({
          envelope: state.data.envelope,
          recipientPublicKey: device.publicKeyBase64,
          privateKey: device.privateKey,
          meetingId,
          keyVersion: state.data.key_version,
        });
        if (!cancelled && mounted.current)
          applyKey(key, state.data.key_version);
        return;
      }

      if (state.data.key_version === 0) {
        // Nobody has created a key yet: make one and seal it for both sides.
        const recipients = await getParticipantKeys(meetingId);
        const key = generateRoomKey();
        const envelopes = await sealFor(recipients.data, key, meetingId, 1);
        await publishMeetingKeys(meetingId, 1, envelopes);
        if (!cancelled && mounted.current) applyKey(key, 1);
        return;
      }

      await requestMeetingKey(meetingId);
      if (cancelled || !mounted.current) return;
      keyVersionRef.current = state.data.key_version;
      setKeyVersion(state.data.key_version);
      setPhase('awaiting-key');
    };

    void acquire().catch((err: unknown) => {
      if (cancelled || !mounted.current) return;
      setError(
        getApiErrorMessage(
          err,
          'The meeting encryption key could not be prepared.'
        )
      );
      setPhase('error');
    });

    return () => {
      cancelled = true;
    };
  }, [meetingId, attempt, applyKey, ensureDevice]);

  /* Waiting for the other participant to seal the key for this browser. */
  useEffect(() => {
    if (phase !== 'awaiting-key' || meetingId === null) return;
    let cancelled = false;

    const timer = window.setInterval(() => {
      const device = deviceRef.current;
      if (device === null) return;

      void getMeetingKeyState(meetingId)
        .then(async (state) => {
          if (cancelled || state.data.envelope === null || !mounted.current)
            return;
          const key = await openRoomKey({
            envelope: state.data.envelope,
            recipientPublicKey: device.publicKeyBase64,
            privateKey: device.privateKey,
            meetingId,
            keyVersion: state.data.key_version,
          });
          if (!cancelled && mounted.current)
            applyKey(key, state.data.key_version);
        })
        .catch(() => {
          // Expected while waiting; the next tick retries.
        });
    }, AWAITING_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [phase, meetingId, applyKey]);

  /* Holding the key: serve requests from a participant that lacks it. */
  useEffect(() => {
    if (phase !== 'ready' || meetingId === null) return;
    let cancelled = false;

    const tick = async (): Promise<void> => {
      const key = roomKeyRef.current;
      const device = deviceRef.current;
      if (key === null || device === null) return;

      const state = await getMeetingKeyState(meetingId);
      if (cancelled || !mounted.current) return;

      if (state.data.key_version !== keyVersionRef.current) {
        // Somebody rotated the key: pick up the new generation.
        if (state.data.envelope !== null) {
          const rotated = await openRoomKey({
            envelope: state.data.envelope,
            recipientPublicKey: device.publicKeyBase64,
            privateKey: device.privateKey,
            meetingId,
            keyVersion: state.data.key_version,
          });
          if (!cancelled && mounted.current) {
            applyKey(rotated, state.data.key_version);
          }
        }
        return;
      }

      setPendingRequests(state.data.pending_requests.length);
      if (state.data.pending_requests.length === 0) return;

      const registered = await getParticipantKeys(meetingId);
      const wanted = new Set(
        state.data.pending_requests.map(
          (request) => `${request.user_type}:${request.user_id}`
        )
      );
      const recipients = registered.data.filter((entry) =>
        wanted.has(`${entry.user_type}:${entry.user_id}`)
      );
      if (recipients.length === 0) return;

      const envelopes = await sealFor(
        recipients,
        key,
        meetingId,
        keyVersionRef.current
      );
      await publishMeetingKeys(meetingId, keyVersionRef.current, envelopes);
      if (!cancelled && mounted.current) setPendingRequests(0);
    };

    void tick().catch(() => undefined);
    const timer = window.setInterval(() => {
      void tick().catch(() => undefined);
    }, HOLDER_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [phase, meetingId, applyKey]);

  const refresh = useCallback(async (): Promise<void> => {
    const device = deviceRef.current;
    if (meetingId === null || device === null) return;

    const state = await getMeetingKeyState(meetingId);
    if (state.data.envelope === null) return;

    const key = await openRoomKey({
      envelope: state.data.envelope,
      recipientPublicKey: device.publicKeyBase64,
      privateKey: device.privateKey,
      meetingId,
      keyVersion: state.data.key_version,
    });
    if (mounted.current) applyKey(key, state.data.key_version);
  }, [meetingId, applyKey]);

  const rotate = useCallback(async (): Promise<void> => {
    if (meetingId === null) return;

    const recipients = await getParticipantKeys(meetingId);
    const nextVersion = keyVersionRef.current + 1;
    const key = generateRoomKey();
    const envelopes = await sealFor(
      recipients.data,
      key,
      meetingId,
      nextVersion
    );
    await publishMeetingKeys(meetingId, nextVersion, envelopes);
    if (mounted.current) applyKey(key, nextVersion);
  }, [meetingId, applyKey]);

  const retry = useCallback((): void => setAttempt((value) => value + 1), []);

  return {
    phase,
    keyVersion,
    roomKey,
    fingerprint,
    error,
    pendingRequests,
    retry,
    rotate,
    refresh,
  };
}
