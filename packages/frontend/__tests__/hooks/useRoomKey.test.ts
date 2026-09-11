import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The key exchange that decides whether a call may start at all.
 *
 * The property that matters most is negative: `phase` must not reach `ready`
 * unless this browser actually holds the room key. A bug that let it through
 * would start a call the other side cannot decrypt, or — worse — suggest a
 * protection that is not there.
 */

const api = {
  getMeetingKeyState: vi.fn(),
  getMyDeviceKey: vi.fn(),
  getParticipantKeys: vi.fn(),
  publishMeetingKeys: vi.fn(),
  registerDeviceKey: vi.fn(),
  requestMeetingKey: vi.fn(),
};

vi.mock('../../src/api/api', () => ({
  ...api,
  getMeetingKeyState: (...a: unknown[]) => api.getMeetingKeyState(...a),
  getMyDeviceKey: (...a: unknown[]) => api.getMyDeviceKey(...a),
  getParticipantKeys: (...a: unknown[]) => api.getParticipantKeys(...a),
  publishMeetingKeys: (...a: unknown[]) => api.publishMeetingKeys(...a),
  registerDeviceKey: (...a: unknown[]) => api.registerDeviceKey(...a),
  requestMeetingKey: (...a: unknown[]) => api.requestMeetingKey(...a),
  getApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const deviceKey = {
  publicKeyBase64: 'PUBLIC-KEY',
  fingerprint: 'aaaa bbbb cccc dddd',
};

vi.mock('../../src/utils/deviceKeys', () => ({
  getDeviceKey: vi.fn(async () => deviceKey),
}));

const ROOM_KEY = new Uint8Array([1, 2, 3, 4]);

vi.mock('../../src/utils/e2ee', () => ({
  generateRoomKey: vi.fn(() => ROOM_KEY),
  sealRoomKey: vi.fn(async () => ({
    ephemeral_public_key: 'eph',
    salt: 'salt',
    iv: 'iv',
    ciphertext: 'cipher',
  })),
  openRoomKey: vi.fn(async () => ROOM_KEY),
}));

const { useRoomKey } = await import('../../src/hooks/useRoomKey');
const e2ee = await import('../../src/utils/e2ee');

/** The participants the server reports as having a registered device key. */
const participants = [
  {
    user_type: 'student',
    user_id: 's1',
    public_key: 'PK-S',
    fingerprint: 'f1',
  },
  {
    user_type: 'faculty',
    user_id: 'f1',
    public_key: 'PK-F',
    fingerprint: 'f2',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.getMyDeviceKey.mockResolvedValue({ data: { public_key: 'PUBLIC-KEY' } });
  api.getParticipantKeys.mockResolvedValue({ data: participants });
  api.publishMeetingKeys.mockResolvedValue({ data: { key_version: 1 } });
  api.registerDeviceKey.mockResolvedValue({ data: {} });
  api.requestMeetingKey.mockResolvedValue({ data: {} });
});

describe('first participant into a fresh meeting', () => {
  it('mints a key and seals it for everyone, then is ready', async () => {
    api.getMeetingKeyState.mockResolvedValue({
      data: { key_version: 0, envelope: null, pending_requests: [] },
    });

    const { result } = renderHook(() => useRoomKey(21));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.roomKey).toEqual(ROOM_KEY);
    expect(e2ee.generateRoomKey).toHaveBeenCalledOnce();

    // Both sides must get an envelope, or the other participant is locked out.
    const [, version, envelopes] = api.publishMeetingKeys.mock.calls[0];
    expect(version).toBe(1);
    expect(envelopes).toHaveLength(2);
    expect(
      envelopes.map((e: { recipient_id: string }) => e.recipient_id)
    ).toEqual(['s1', 'f1']);
  });
});

describe('joining a meeting that already has a key', () => {
  it('opens the envelope sealed for this browser', async () => {
    api.getMeetingKeyState.mockResolvedValue({
      data: {
        key_version: 3,
        envelope: {
          key_version: 3,
          ephemeral_public_key: 'eph',
          salt: 'salt',
          iv: 'iv',
          ciphertext: 'cipher',
        },
        pending_requests: [],
      },
    });

    const { result } = renderHook(() => useRoomKey(21));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.keyVersion).toBe(3);
    expect(e2ee.openRoomKey).toHaveBeenCalledOnce();
    // Nothing new is minted when a key already exists.
    expect(e2ee.generateRoomKey).not.toHaveBeenCalled();
  });
});

describe('joining without an envelope', () => {
  it('asks for the key and waits rather than starting unencrypted', async () => {
    api.getMeetingKeyState.mockResolvedValue({
      data: { key_version: 2, envelope: null, pending_requests: [] },
    });

    const { result } = renderHook(() => useRoomKey(21));

    await waitFor(() => expect(result.current.phase).toBe('awaiting-key'));
    expect(api.requestMeetingKey).toHaveBeenCalledWith(21);
    // The decisive assertion: no key, and not ready.
    expect(result.current.roomKey).toBeNull();
    expect(result.current.phase).not.toBe('ready');
  });
});

describe('when the key cannot be opened', () => {
  it('reports an error instead of proceeding', async () => {
    api.getMeetingKeyState.mockResolvedValue({
      data: {
        key_version: 3,
        envelope: {
          key_version: 3,
          ephemeral_public_key: 'eph',
          salt: 'salt',
          iv: 'iv',
          ciphertext: 'cipher',
        },
        pending_requests: [],
      },
    });
    vi.mocked(e2ee.openRoomKey).mockRejectedValueOnce(
      new Error('decrypt failed')
    );

    const { result } = renderHook(() => useRoomKey(21));

    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.roomKey).toBeNull();
  });

  it('reports an error when the key state cannot be fetched', async () => {
    api.getMeetingKeyState.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useRoomKey(21));

    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.roomKey).toBeNull();
  });
});

describe('device key registration', () => {
  it('registers this browser key when the server has none', async () => {
    api.getMyDeviceKey.mockResolvedValue({ data: null });
    api.getMeetingKeyState.mockResolvedValue({
      data: { key_version: 0, envelope: null, pending_requests: [] },
    });

    renderHook(() => useRoomKey(21));

    await waitFor(() =>
      expect(api.registerDeviceKey).toHaveBeenCalledWith('PUBLIC-KEY')
    );
  });

  it('re-registers when the stored key belongs to a different browser', async () => {
    // A stale key on the server would have the other side seal envelopes this
    // browser cannot open.
    api.getMyDeviceKey.mockResolvedValue({
      data: { public_key: 'SOMEONE-ELSES-KEY' },
    });
    api.getMeetingKeyState.mockResolvedValue({
      data: { key_version: 0, envelope: null, pending_requests: [] },
    });

    renderHook(() => useRoomKey(21));

    await waitFor(() =>
      expect(api.registerDeviceKey).toHaveBeenCalledWith('PUBLIC-KEY')
    );
  });

  it('exposes the fingerprint so participants can compare it out of band', async () => {
    api.getMeetingKeyState.mockResolvedValue({
      data: { key_version: 0, envelope: null, pending_requests: [] },
    });

    const { result } = renderHook(() => useRoomKey(21));

    await waitFor(() =>
      expect(result.current.fingerprint).toBe(deviceKey.fingerprint)
    );
  });
});
