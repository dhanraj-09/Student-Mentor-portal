import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
} from '@livekit/track-processors';
import type { LocalVideoTrack } from 'livekit-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BaseKeyProvider,
  ConnectionQuality,
  ConnectionState,
  LocalParticipant,
  Participant,
  Room,
  RoomEvent,
  Track,
  createKeyMaterialFromBuffer,
  isE2EESupported,
} from 'livekit-client';
import type { TrackPublication } from 'livekit-client';
import E2eeWorker from 'livekit-client/e2ee-worker?worker';
import { getRoomAccess } from '../api/api';
import { E2EE } from '../utils/e2ee';

/**
 * The LiveKit room lifecycle for a meeting call.
 *
 * End-to-end encryption is configured before `connect()` and verified after it:
 * if the room ever comes up without encryption the session is torn down rather
 * than continued in the clear.
 */

export type CallState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export interface ParticipantView {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  connectionQuality: ConnectionQuality;
  cameraPublication?: TrackPublication;
  screenSharePublication?: TrackPublication;
  audioPublication?: TrackPublication;
  encrypted: boolean;
}

/**
 * Key provider backed by our own distribution. `ExternalE2EEKeyProvider` takes
 * a single key with no index, which makes rotation lossy; extending
 * `BaseKeyProvider` gives each generation its own keyring slot, so frames still
 * in flight under the previous key keep decrypting.
 */
class RotatingKeyProvider extends BaseKeyProvider {
  constructor() {
    super({ sharedKey: true, keySize: 256, keyringSize: E2EE.KEYRING_SIZE });
  }

  async setRoomKey(roomKey: Uint8Array, keyVersion: number): Promise<void> {
    const material = await createKeyMaterialFromBuffer(roomKey.slice().buffer);
    this.onSetEncryptionKey(
      material,
      undefined,
      keyVersion % E2EE.KEYRING_SIZE
    );
  }
}

export interface E2eeSupport {
  supported: boolean;
  reason: string;
}

/** E2EE needs a secure context and encoded-transform support. */
export function checkE2eeSupport(): E2eeSupport {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'No browser environment.' };
  }
  if (!window.isSecureContext) {
    return {
      supported: false,
      reason:
        'This page is not a secure context. Open the portal over HTTPS (or http://localhost) so the browser allows encrypted media and camera access.',
    };
  }
  if (!isE2EESupported()) {
    return {
      supported: false,
      reason:
        'This browser cannot encrypt media frames end to end. Use a recent Chrome, Edge or Safari.',
    };
  }
  return { supported: true, reason: '' };
}

const SNAPSHOT_EVENTS: RoomEvent[] = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.ConnectionQualityChanged,
  RoomEvent.ParticipantEncryptionStatusChanged,
];

function toView(
  participant: Participant,
  e2eeEnabled: boolean
): ParticipantView {
  const camera = participant.getTrackPublication(Track.Source.Camera);
  const screenShare = participant.getTrackPublication(Track.Source.ScreenShare);
  const microphone = participant.getTrackPublication(Track.Source.Microphone);
  const isLocal = participant instanceof LocalParticipant;

  return {
    identity: participant.identity,
    name:
      participant.name !== undefined && participant.name !== ''
        ? participant.name
        : participant.identity,
    isLocal,
    isSpeaking: participant.isSpeaking,
    micEnabled: participant.isMicrophoneEnabled,
    cameraEnabled: participant.isCameraEnabled,
    screenSharing: screenShare?.track !== undefined,
    connectionQuality: participant.connectionQuality,
    cameraPublication: camera,
    screenSharePublication: screenShare,
    audioPublication: microphone,
    encrypted: isLocal ? e2eeEnabled : participant.isEncrypted,
  };
}

/** LiveKit flips `isE2EEEnabled` on signal connect, so poll briefly for it. */
async function waitForEncryption(
  room: Room,
  timeoutMs = 5000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (room.isE2EEEnabled && room.localParticipant.isE2EEEnabled) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return room.isE2EEEnabled && room.localParticipant.isE2EEEnabled;
}

export interface UseMeetingCallOptions {
  meetingId: number | null;
  roomKey: Uint8Array | null;
  keyVersion: number;
  enabled: boolean;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
}

export interface UseMeetingCallResult {
  state: CallState;
  participants: ParticipantView[];
  error: string;
  fatal: boolean;
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  /** Background blur, applied locally before the frame is encrypted. */
  blurOn: boolean;
  blurBusy: boolean;
  blurSupported: boolean;
  e2eeActive: boolean;
  /** Exposed so chat, reactions and recording can use the same connection. */
  room: Room | null;
  audioBlocked: boolean;
  toggleMic: () => Promise<void>;
  toggleCam: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleBlur: () => Promise<void>;
  switchDevice: (kind: MediaDeviceKind, deviceId: string) => Promise<void>;
  enableAudio: () => Promise<void>;
  leave: () => Promise<void>;
  retry: () => void;
}

/** Strong enough to obscure a room without eating the subject's edges. */
const BLUR_RADIUS = 12;

export function useMeetingCall(
  options: UseMeetingCallOptions
): UseMeetingCallResult {
  const { meetingId, roomKey, keyVersion, enabled } = options;

  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<CallState>('idle');
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState(false);
  const [snapshot, setSnapshot] = useState(0);
  const [micOn, setMicOn] = useState(options.microphoneEnabled);
  const [camOn, setCamOn] = useState(options.cameraEnabled);
  const [screenSharing, setScreenSharing] = useState(false);
  const [blurOn, setBlurOn] = useState(false);
  const [blurBusy, setBlurBusy] = useState(false);
  // Built once: constructing it downloads and initialises the segmentation
  // model, which is the multi-second pause on first use.
  const blurProcessorRef = useRef<ReturnType<
    typeof BackgroundProcessor
  > | null>(null);
  const [e2eeActive, setE2eeActive] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // The connect effect must not restart when a preference changes.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const keyProviderRef = useRef<RotatingKeyProvider | null>(null);
  const roomRef = useRef<Room | null>(null);

  const bump = useCallback((): void => setSnapshot((value) => value + 1), []);
  const hasKey = roomKey !== null;

  useEffect(() => {
    if (!enabled || !hasKey || meetingId === null) return;

    const support = checkE2eeSupport();
    if (!support.supported) {
      setError(`${support.reason} Your meeting has not been joined.`);
      setFatal(true);
      setState('failed');
      return;
    }

    let cancelled = false;
    const worker = new E2eeWorker();
    const keyProvider = new RotatingKeyProvider();
    keyProviderRef.current = keyProvider;

    const call = new Room({
      adaptiveStream: true,
      dynacast: true,
      // `encryption` (not the deprecated `e2ee`) also encrypts data messages.
      encryption: { keyProvider, worker },
      // 540p24 rather than 720p30. Every frame is encrypted individually, and
      // background blur runs a segmentation model over each one, so capture
      // size drives CPU on the sending machine more than link bandwidth does.
      videoCaptureDefaults: {
        resolution: { width: 960, height: 540, frameRate: 24 },
      },
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
      publishDefaults: {
        // Simulcast encodes three resolutions of every frame. That pays off in
        // a large room where subscribers need different qualities; in a
        // two-person mentoring call it triples encode and encryption work for
        // no one's benefit.
        simulcast: false,
        // VP8 is markedly cheaper to encode than VP9/AV1 and avoids the
        // SVC paths that interact badly with per-frame encryption.
        videoCodec: 'vp8',
        videoEncoding: { maxBitrate: 900_000, maxFramerate: 24 },
        // Keep motion smooth when the link tightens; a mentoring call is
        // people talking, where stutter reads far worse than softness.
        degradationPreference: 'maintain-framerate',
        dtx: true,
        red: true,
      },
    });

    roomRef.current = call;
    setRoom(call);

    const onConnectionState = (next: ConnectionState): void => {
      if (cancelled) return;
      if (next === ConnectionState.Connecting) setState('connecting');
      else if (next === ConnectionState.Connected) setState('connected');
      else if (
        next === ConnectionState.Reconnecting ||
        next === ConnectionState.SignalReconnecting
      ) {
        setState('reconnecting');
      } else if (next === ConnectionState.Disconnected)
        setState('disconnected');
      bump();
    };

    const onDisconnected = (): void => {
      if (cancelled) return;
      setState('disconnected');
      setE2eeActive(false);
    };

    const onMediaError = (mediaError: Error): void => {
      setError(describeMediaError(mediaError));
    };

    const onEncryptionError = (): void => {
      setError(
        'A participant is using a different encryption key, so their audio and video cannot be shown.'
      );
    };

    const onAudioPlayback = (): void => setAudioBlocked(!call.canPlaybackAudio);

    SNAPSHOT_EVENTS.forEach((event) => call.on(event, bump));
    call.on(RoomEvent.ConnectionStateChanged, onConnectionState);
    call.on(RoomEvent.Disconnected, onDisconnected);
    call.on(RoomEvent.MediaDevicesError, onMediaError);
    call.on(RoomEvent.EncryptionError, onEncryptionError);
    call.on(RoomEvent.AudioPlaybackStatusChanged, onAudioPlayback);

    const connect = async (): Promise<void> => {
      const current = optionsRef.current;
      try {
        setState('connecting');
        setError('');
        setFatal(false);

        // 1. Install the key and switch encryption on before connecting.
        if (current.roomKey === null)
          throw new Error('No encryption key available.');
        await keyProvider.setRoomKey(current.roomKey, current.keyVersion);
        await call.setE2EEEnabled(true);
        if (!call.localParticipant.isE2EEEnabled) {
          throw new Error('End-to-end encryption could not be enabled.');
        }

        // 2. Only then ask the server for a short-lived token.
        const access = await getRoomAccess(meetingId);
        if (cancelled) return;

        await call.connect(access.data.server_url, access.data.token, {
          autoSubscribe: true,
        });
        if (cancelled) {
          await call.disconnect(true);
          return;
        }

        // 3. Re-verify against the connected room.
        if (!(await waitForEncryption(call))) {
          await call.disconnect(true);
          throw new Error('The room connected without end-to-end encryption.');
        }
        setE2eeActive(true);

        if (current.microphoneEnabled) {
          await call.localParticipant
            .setMicrophoneEnabled(true)
            .catch(onMediaError);
        }
        if (current.cameraEnabled) {
          await call.localParticipant
            .setCameraEnabled(true)
            .catch(onMediaError);
        }

        // Pull the segmentation assets into the HTTP cache now, while the
        // user is settling into the call, rather than when they click Blur.
        if (supportsBackgroundProcessors()) {
          void Promise.all([
            fetch(
              `${window.location.origin}/mediapipe/selfie_segmenter.tflite`
            ),
            fetch(
              `${window.location.origin}/mediapipe/wasm/vision_wasm_internal.wasm`
            ),
          ]).catch(() => undefined);
        }

        if (!cancelled) {
          setMicOn(call.localParticipant.isMicrophoneEnabled);
          setCamOn(call.localParticipant.isCameraEnabled);
          setAudioBlocked(!call.canPlaybackAudio);
          bump();
        }
      } catch (connectError) {
        if (cancelled) return;
        setState('failed');
        setE2eeActive(false);
        setFatal(true);
        setError(
          connectError instanceof Error && connectError.message !== ''
            ? connectError.message
            : 'The call could not be joined. Please try again.'
        );
      }
    };

    void connect();

    return () => {
      cancelled = true;
      SNAPSHOT_EVENTS.forEach((event) => call.off(event, bump));
      call.off(RoomEvent.ConnectionStateChanged, onConnectionState);
      call.off(RoomEvent.Disconnected, onDisconnected);
      call.off(RoomEvent.MediaDevicesError, onMediaError);
      call.off(RoomEvent.EncryptionError, onEncryptionError);
      call.off(RoomEvent.AudioPlaybackStatusChanged, onAudioPlayback);

      // Releases the camera and microphone.
      void call.disconnect(true).catch(() => undefined);
      worker.terminate();
      if (roomRef.current === call) roomRef.current = null;
      keyProviderRef.current = null;
      setRoom(null);
      setE2eeActive(false);
    };
  }, [enabled, hasKey, meetingId, attempt, bump]);

  /* A rotated key is applied to the live session instead of reconnecting. */
  useEffect(() => {
    if (roomKey === null || keyProviderRef.current === null) return;
    void keyProviderRef.current.setRoomKey(roomKey, keyVersion);
  }, [roomKey, keyVersion]);

  const toggleMic = useCallback(async (): Promise<void> => {
    const call = roomRef.current;
    if (call === null) return;
    try {
      await call.localParticipant.setMicrophoneEnabled(
        !call.localParticipant.isMicrophoneEnabled
      );
      setMicOn(call.localParticipant.isMicrophoneEnabled);
    } catch (mediaError) {
      setError(describeMediaError(mediaError));
    }
  }, []);

  const toggleCam = useCallback(async (): Promise<void> => {
    const call = roomRef.current;
    if (call === null) return;
    try {
      await call.localParticipant.setCameraEnabled(
        !call.localParticipant.isCameraEnabled
      );
      setCamOn(call.localParticipant.isCameraEnabled);
    } catch (mediaError) {
      setError(describeMediaError(mediaError));
    }
  }, []);

  /**
   * Blurs whatever is behind the speaker.
   *
   * Segmentation runs in this browser on the raw camera frames, before
   * encryption and before anything leaves the machine — the blurred image is
   * what gets encrypted and sent, so the real background is never transmitted
   * and the server could not recover it even if it tried.
   *
   * Assets are served from this app's own origin (see
   * scripts/mediapipe-assets.mjs) rather than a CDN, so turning blur on
   * mid-call does not depend on a third party being reachable.
   */
  const toggleBlur = useCallback(async (): Promise<void> => {
    const call = roomRef.current;
    if (call === null) return;

    const publication = call.localParticipant.getTrackPublication(
      Track.Source.Camera
    );
    const track = publication?.track as LocalVideoTrack | undefined;
    if (track === undefined) {
      setError('Turn the camera on before changing the background.');
      return;
    }

    setBlurBusy(true);
    try {
      if (track.getProcessor() !== undefined) {
        await track.stopProcessor();
        setBlurOn(false);
      } else {
        blurProcessorRef.current ??= BackgroundProcessor({
          mode: 'background-blur',
          blurRadius: BLUR_RADIUS,
          assetPaths: {
            tasksVisionFileSet: `${window.location.origin}/mediapipe/wasm`,
            modelAssetPath: `${window.location.origin}/mediapipe/selfie_segmenter.tflite`,
          },
        });
        await track.setProcessor(blurProcessorRef.current);
        setBlurOn(true);
      }
    } catch (blurError) {
      setBlurOn(false);
      setError(
        blurError instanceof Error
          ? `Background blur failed: ${blurError.message}`
          : 'Background blur is not available on this device.'
      );
    } finally {
      setBlurBusy(false);
    }
  }, []);

  /** Switches the active camera or microphone without dropping the call. */
  const switchDevice = useCallback(
    async (kind: MediaDeviceKind, deviceId: string): Promise<void> => {
      const call = roomRef.current;
      if (call === null) return;
      try {
        await call.switchActiveDevice(kind, deviceId);
      } catch (deviceError) {
        setError(describeMediaError(deviceError));
      }
    },
    []
  );

  const toggleScreenShare = useCallback(async (): Promise<void> => {
    const call = roomRef.current;
    if (call === null) return;
    try {
      // Screen share travels through the same encrypted pipeline as the camera.
      await call.localParticipant.setScreenShareEnabled(
        !call.localParticipant.isScreenShareEnabled,
        { audio: false }
      );
      setScreenSharing(call.localParticipant.isScreenShareEnabled);
    } catch (mediaError) {
      setError(describeMediaError(mediaError));
    }
  }, []);

  const enableAudio = useCallback(async (): Promise<void> => {
    const call = roomRef.current;
    if (call === null) return;
    await call.startAudio();
    setAudioBlocked(!call.canPlaybackAudio);
  }, []);

  const leave = useCallback(async (): Promise<void> => {
    const call = roomRef.current;
    if (call === null) return;
    await call.disconnect(true);
  }, []);

  const retry = useCallback((): void => setAttempt((value) => value + 1), []);

  const participants = useMemo<ParticipantView[]>(() => {
    if (room === null) return [];
    // `snapshot` is the change signal for the mutable LiveKit objects.
    void snapshot;
    const remote = [...room.remoteParticipants.values()].map((participant) =>
      toView(participant, e2eeActive)
    );
    return [toView(room.localParticipant, e2eeActive), ...remote];
  }, [room, snapshot, e2eeActive]);

  return {
    state,
    participants,
    error,
    fatal,
    micOn,
    camOn,
    screenSharing,
    blurOn,
    blurBusy,
    blurSupported: supportsBackgroundProcessors(),
    e2eeActive,
    room,
    audioBlocked,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    toggleBlur,
    switchDevice,
    enableAudio,
    leave,
    retry,
  };
}

/** Turns a raw media failure into something a user can act on. */
export function describeMediaError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';

  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Browsers only allow camera and microphone access on secure origins. Open the portal over HTTPS.';
  }

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera and microphone access was denied. Allow it for this site in your browser, then try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera or microphone was found. You can still join with them switched off.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Your camera or microphone is already in use by another application or tab.';
    case 'OverconstrainedError':
      return 'The selected device is unavailable. Pick another one and try again.';
    default:
      return error instanceof Error && error.message !== ''
        ? error.message
        : 'Could not start your camera or microphone.';
  }
}
