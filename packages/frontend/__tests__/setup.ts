/**
 * jsdom implements almost none of the media stack, so the pieces the call
 * hooks reach for are stubbed here rather than in each test. Anything a test
 * actually asserts on is overridden locally.
 */
import { vi } from 'vitest';

if (globalThis.crypto?.randomUUID === undefined) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...globalThis.crypto,
      randomUUID: () => `id-${Math.random().toString(16).slice(2)}`,
    },
    configurable: true,
  });
}

// enumerateDevices/getUserMedia do not exist in jsdom.
Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  value: {
    enumerateDevices: vi.fn(async () => []),
    getUserMedia: vi.fn(async () => ({ getTracks: () => [] })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  configurable: true,
  writable: true,
});

// jsdom has no canvas backend and no MediaRecorder.
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  fillStyle: '',
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
  value: vi.fn(() => ({ addTrack: vi.fn(), getAudioTracks: () => [] })),
  configurable: true,
});

globalThis.URL.createObjectURL = vi.fn(() => 'blob:test');
globalThis.URL.revokeObjectURL = vi.fn();
