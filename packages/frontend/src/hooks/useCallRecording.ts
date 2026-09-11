import type { Room } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Records the call locally, in this browser.
 *
 * The server relays ciphertext it cannot decrypt, so a server-side recording
 * is impossible by construction. The only place the call exists in the clear
 * is the participant's own machine, so that is where it is captured: the
 * decoded video tiles are drawn onto a canvas and every audio track is mixed
 * through WebAudio, giving one WebM the user downloads. Nothing is uploaded.
 *
 * Because a recording is invisible to the other side, starting one broadcasts
 * a notice over the data channel — a recording nobody is told about is a
 * different feature from the one this is meant to be.
 */

const FRAME_RATE = 25;
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
/** Flushed to memory in chunks so a long call does not stall the recorder. */
const CHUNK_MS = 1000;

export interface CallRecordingResult {
  recording: boolean;
  supported: boolean;
  error: string | null;
  elapsedMs: number;
  start: () => Promise<void>;
  stop: () => void;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useCallRecording(
  room: Room | null,
  onStateChange?: (active: boolean) => void
): CallRecordingResult {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const startedAtRef = useRef(0);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    recorderRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder !== null && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (room === null || recorderRef.current !== null) return;

    const mimeType = pickMimeType();
    if (mimeType === undefined) {
      setError('This browser cannot record video.');
      return;
    }

    setError(null);

    try {
      // --- video: composite the decoded tiles onto a canvas ----------------
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('Canvas is unavailable.');

      const draw = (): void => {
        // The rendered <video> elements are the decrypted frames; reading them
        // avoids decoding every track a second time.
        const videos = Array.from(
          document.querySelectorAll<HTMLVideoElement>('.mc-tile video')
        ).filter((video) => video.videoWidth > 0);

        context.fillStyle = '#0f172a';
        context.fillRect(0, 0, canvas.width, canvas.height);

        if (videos.length > 0) {
          const columns = Math.ceil(Math.sqrt(videos.length));
          const rows = Math.ceil(videos.length / columns);
          const cellWidth = canvas.width / columns;
          const cellHeight = canvas.height / rows;

          videos.forEach((video, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            // Letterbox rather than stretch, so faces keep their proportions.
            const scale = Math.min(
              cellWidth / video.videoWidth,
              cellHeight / video.videoHeight
            );
            const width = video.videoWidth * scale;
            const height = video.videoHeight * scale;
            context.drawImage(
              video,
              column * cellWidth + (cellWidth - width) / 2,
              row * cellHeight + (cellHeight - height) / 2,
              width,
              height
            );
          });
        }

        rafRef.current = requestAnimationFrame(draw);
      };
      draw();

      const stream = canvas.captureStream(FRAME_RATE);

      // --- audio: mix every participant into one track ---------------------
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const destination = audioContext.createMediaStreamDestination();
      let mixed = 0;

      const addAudio = (track: MediaStreamTrack | undefined): void => {
        if (track === undefined) return;
        const source = audioContext.createMediaStreamSource(
          new MediaStream([track])
        );
        source.connect(destination);
        mixed += 1;
      };

      for (const publication of room.localParticipant.trackPublications.values()) {
        if (publication.kind === 'audio') {
          addAudio(publication.track?.mediaStreamTrack);
        }
      }
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication.kind === 'audio') {
            addAudio(publication.track?.mediaStreamTrack);
          }
        }
      }
      if (mixed > 0) {
        for (const track of destination.stream.getAudioTracks()) {
          stream.addTrack(track);
        }
      }

      // --- record ----------------------------------------------------------
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.href = url;
        link.download = `mentoring-call-${stamp}.webm`;
        link.click();
        // Revoking immediately can cancel the download in some browsers.
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);

        cleanup();
        setRecording(false);
        setElapsedMs(0);
        onStateChange?.(false);
      };

      recorder.start(CHUNK_MS);
      startedAtRef.current = Date.now();
      setRecording(true);
      onStateChange?.(true);
    } catch (recordError) {
      cleanup();
      setRecording(false);
      setError(
        recordError instanceof Error
          ? recordError.message
          : 'Could not start recording.'
      );
    }
  }, [cleanup, onStateChange, room]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setElapsedMs(Date.now() - startedAtRef.current),
      1000
    );
    return () => window.clearInterval(timer);
  }, [recording]);

  // Leaving the page mid-recording should still yield the file.
  useEffect(() => () => stop(), [stop]);

  return {
    recording,
    supported: typeof MediaRecorder !== 'undefined',
    error,
    elapsedMs,
    start,
    stop,
  };
}
