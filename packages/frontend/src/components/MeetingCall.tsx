import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Lock,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { ConnectionQuality } from 'livekit-client';
import { getApiErrorMessage, resetMeetingEncryption } from '../api/api';
import { useMeetingCall, checkE2eeSupport } from '../hooks/useMeetingCall';
import type { ParticipantView } from '../hooks/useMeetingCall';
import { useRoomKey } from '../hooks/useRoomKey';
import './meetingcall.css';

/**
 * The encrypted video call for an ongoing meeting.
 *
 * Shared by the student and faculty pages: the call itself is identical for
 * both roles, only the surrounding page and the "back" destination differ.
 */

interface MeetingCallProps {
  meetingId: number;
  /** Shown in the header, e.g. the other participant's name. */
  title: string;
  subtitle?: string;
  /** Only the mentor may rotate the meeting encryption key. */
  canRotateKey?: boolean;
  onLeave: () => void;
}

const QUALITY_LABEL: Record<string, string> = {
  [ConnectionQuality.Excellent]: 'Excellent connection',
  [ConnectionQuality.Good]: 'Good connection',
  [ConnectionQuality.Poor]: 'Poor connection',
  [ConnectionQuality.Lost]: 'Connection lost',
  [ConnectionQuality.Unknown]: 'Connection unknown',
};

const STATE_LABEL: Record<string, string> = {
  idle: 'Preparing…',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  disconnected: 'Connection lost',
  failed: 'Connection failed',
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const Tile = ({ participant }: { participant: ParticipantView }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const publication = participant.screenSharing
    ? participant.screenSharePublication
    : participant.cameraPublication;
  const videoTrack = publication?.track;
  const audioTrack = participant.isLocal
    ? undefined
    : participant.audioPublication?.track;
  const showVideo =
    videoTrack !== undefined &&
    (participant.screenSharing || participant.cameraEnabled);

  useEffect(() => {
    const element = videoRef.current;
    if (element === null || videoTrack === undefined || !showVideo) return;
    videoTrack.attach(element);
    return () => {
      videoTrack.detach(element);
    };
  }, [videoTrack, showVideo]);

  useEffect(() => {
    const element = audioRef.current;
    if (element === null || audioTrack === undefined) return;
    audioTrack.attach(element);
    return () => {
      audioTrack.detach(element);
    };
  }, [audioTrack]);

  const quality =
    QUALITY_LABEL[participant.connectionQuality] ?? 'Connection unknown';

  return (
    <figure
      className={`mc-tile ${participant.isSpeaking ? 'speaking' : ''}`}
      aria-label={`${participant.name}. ${
        participant.micEnabled ? 'Microphone on' : 'Microphone muted'
      }. ${showVideo ? 'Camera on' : 'Camera off'}. ${quality}.`}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          className={`mc-video ${participant.isLocal && !participant.screenSharing ? 'mirrored' : ''}`}
          autoPlay
          playsInline
          muted
          data-local={participant.isLocal ? 'true' : 'false'}
        />
      ) : (
        <div className="mc-placeholder">
          <span className="mc-avatar">{initialsOf(participant.name)}</span>
          <span>Camera off</span>
        </div>
      )}

      {audioTrack !== undefined && <audio ref={audioRef} autoPlay />}

      <figcaption className="mc-caption">
        <span className="mc-name">
          {participant.name}
          {participant.isLocal && <span className="mc-you"> (you)</span>}
        </span>
        <span className="mc-badges">
          <span
            className={`mc-badge ${participant.micEnabled ? '' : 'off'}`}
            title={
              participant.micEnabled ? 'Microphone on' : 'Microphone muted'
            }
          >
            {participant.micEnabled ? <Mic size={13} /> : <MicOff size={13} />}
          </span>
          <span
            className={`mc-badge ${participant.encrypted ? 'secure' : 'insecure'}`}
            title={
              participant.encrypted
                ? 'End-to-end encrypted'
                : 'Encryption status unconfirmed'
            }
          >
            {participant.encrypted ? (
              <Lock size={13} />
            ) : (
              <ShieldAlert size={13} />
            )}
          </span>
        </span>
      </figcaption>
    </figure>
  );
};

const MeetingCall = ({
  meetingId,
  title,
  subtitle,
  canRotateKey = false,
  onLeave,
}: MeetingCallProps) => {
  const [joined, setJoined] = useState(false);
  const [micWanted, setMicWanted] = useState(true);
  const [camWanted, setCamWanted] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const key = useRoomKey(meetingId);
  const support = checkE2eeSupport();

  const call = useMeetingCall({
    meetingId,
    roomKey: key.roomKey,
    keyVersion: key.keyVersion,
    enabled: joined && key.phase === 'ready',
    microphoneEnabled: micWanted,
    cameraEnabled: camWanted,
  });

  const leave = async (): Promise<void> => {
    setLeaving(true);
    await call.leave().catch(() => undefined);
    onLeave();
  };

  const rotate = async (): Promise<void> => {
    setRotating(true);
    try {
      await key.rotate();
    } finally {
      setRotating(false);
    }
  };

  const secure = joined ? call.e2eeActive : key.phase === 'ready';

  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleResetEncryption = async (): Promise<void> => {
    setResetting(true);
    setResetError(null);
    try {
      await resetMeetingEncryption(meetingId);
      // Back to version 0: retrying mints a fresh key for both participants.
      key.retry();
    } catch (error) {
      setResetError(
        getApiErrorMessage(error, 'Could not reset the encryption key.')
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="mc-container">
      <div className="mc-header">
        <div>
          <h1>{title}</h1>
          {subtitle !== undefined && <p>{subtitle}</p>}
        </div>
        <div className={`mc-secure ${secure ? 'on' : 'off'}`} role="status">
          {secure ? <Lock size={16} /> : <ShieldAlert size={16} />}
          <div>
            <strong>
              {secure ? 'End-to-end encrypted' : 'Not encrypted yet'}
            </strong>
            <span>
              {secure
                ? `Key generation ${key.keyVersion}. The server routes this call but cannot decrypt it.`
                : 'The call will not start until encryption is active.'}
            </span>
          </div>
        </div>
      </div>

      {!support.supported && (
        <div className="mc-error">
          <strong>This browser cannot join securely.</strong> {support.reason}
        </div>
      )}

      {key.phase === 'error' && (
        <div className="mc-error">
          <strong>Secure connection could not be established.</strong>{' '}
          {key.error} Your meeting has not been joined.
          <button className="mc-inline-btn" onClick={key.retry}>
            Try again
          </button>
        </div>
      )}

      {key.phase === 'awaiting-key' && (
        <div className="mc-notice">
          Waiting for the encryption key. Your browser has asked the other
          participant to share it; joining unlocks as soon as they open the
          call.
          {/* If both participants have changed browser, nobody holds a key
              that can be reshared and this wait never ends. Only the mentor
              can break the deadlock, because it destroys key material. */}
          {canRotateKey && (
            <>
              {' '}
              Still waiting after both of you have opened the call?{' '}
              <button
                className="mc-inline-btn"
                disabled={resetting}
                onClick={() => void handleResetEncryption()}
              >
                {resetting ? 'Resetting…' : 'Reset encryption'}
              </button>
            </>
          )}
          {resetError !== null && (
            <span className="mc-notice-error"> {resetError}</span>
          )}
        </div>
      )}

      {key.pendingRequests > 0 && (
        <div className="mc-notice">
          Sharing the encryption key with the other participant. The server
          never sees it.
        </div>
      )}

      {call.error !== '' && (
        <div className={call.fatal ? 'mc-error' : 'mc-notice'}>
          {call.error}
          {call.fatal && (
            <button className="mc-inline-btn" onClick={call.retry}>
              Try again
            </button>
          )}
        </div>
      )}

      {call.audioBlocked && (
        <div className="mc-notice">
          Your browser blocked audio playback until you interact with the page.
          <button
            className="mc-inline-btn"
            onClick={() => void call.enableAudio()}
          >
            Enable audio
          </button>
        </div>
      )}

      {!joined ? (
        <div className="mc-lobby">
          <div className="mc-lobby-card">
            <h2>Ready to join?</h2>
            <p>
              Check your devices below. The call is end-to-end encrypted, so it
              only starts once your encryption key is ready.
            </p>

            <div className="mc-lobby-toggles">
              <button
                className={`mc-toggle ${micWanted ? 'on' : ''}`}
                onClick={() => setMicWanted((value) => !value)}
                aria-pressed={micWanted}
              >
                {micWanted ? <Mic size={16} /> : <MicOff size={16} />}
                {micWanted ? 'Microphone on' : 'Microphone off'}
              </button>
              <button
                className={`mc-toggle ${camWanted ? 'on' : ''}`}
                onClick={() => setCamWanted((value) => !value)}
                aria-pressed={camWanted}
              >
                {camWanted ? <Camera size={16} /> : <CameraOff size={16} />}
                {camWanted ? 'Camera on' : 'Camera off'}
              </button>
            </div>

            {key.fingerprint !== null && (
              <p className="mc-fingerprint">
                Your device fingerprint: <code>{key.fingerprint}</code>
              </p>
            )}

            <div className="mc-lobby-actions">
              <button
                className="mc-join-btn"
                onClick={() => setJoined(true)}
                disabled={key.phase !== 'ready' || !support.supported}
              >
                {key.phase === 'ready'
                  ? 'Join securely'
                  : key.phase === 'preparing'
                    ? 'Preparing encryption…'
                    : 'Waiting for encryption key'}
              </button>
              <button className="mc-cancel-btn" onClick={onLeave}>
                Back to meetings
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mc-status" role="status">
            <span className={`mc-dot ${call.state}`} />
            {STATE_LABEL[call.state] ?? call.state}
            <span className="mc-sep">·</span>
            {call.participants.length}{' '}
            {call.participants.length === 1 ? 'participant' : 'participants'}
          </div>

          <div
            className={`mc-grid count-${Math.min(call.participants.length, 4)}`}
          >
            {call.participants.map((participant) => (
              <Tile key={participant.identity} participant={participant} />
            ))}
            {call.participants.length < 2 && call.state === 'connected' && (
              <div className="mc-tile empty">
                <span>Waiting for the other participant to join…</span>
              </div>
            )}
          </div>

          <div
            className="mc-controls"
            role="toolbar"
            aria-label="Call controls"
          >
            <button
              className={`mc-control ${call.micOn ? '' : 'off'}`}
              onClick={() => void call.toggleMic()}
              aria-pressed={call.micOn}
              aria-label={call.micOn ? 'Mute microphone' : 'Unmute microphone'}
              disabled={call.state !== 'connected'}
            >
              {call.micOn ? <Mic size={18} /> : <MicOff size={18} />}
              <span>{call.micOn ? 'Mute' : 'Unmute'}</span>
            </button>

            <button
              className={`mc-control ${call.camOn ? '' : 'off'}`}
              onClick={() => void call.toggleCam()}
              aria-pressed={call.camOn}
              aria-label={call.camOn ? 'Turn camera off' : 'Turn camera on'}
              disabled={call.state !== 'connected'}
            >
              {call.camOn ? <Camera size={18} /> : <CameraOff size={18} />}
              <span>{call.camOn ? 'Camera off' : 'Camera on'}</span>
            </button>

            <button
              className={`mc-control ${call.screenSharing ? 'active' : ''}`}
              onClick={() => void call.toggleScreenShare()}
              aria-pressed={call.screenSharing}
              aria-label={
                call.screenSharing
                  ? 'Stop sharing your screen'
                  : 'Share your screen'
              }
              disabled={call.state !== 'connected'}
            >
              <MonitorUp size={18} />
              <span>{call.screenSharing ? 'Stop share' : 'Share'}</span>
            </button>

            {canRotateKey && (
              <button
                className="mc-control"
                onClick={() => void rotate()}
                disabled={rotating || call.state !== 'connected'}
                aria-label="Rotate the meeting encryption key"
              >
                <RefreshCw size={18} />
                <span>{rotating ? 'Rotating…' : 'New key'}</span>
              </button>
            )}

            <button
              className="mc-control leave"
              onClick={() => void leave()}
              disabled={leaving}
              aria-label="Leave the call"
            >
              <PhoneOff size={18} />
              <span>Leave</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default MeetingCall;
