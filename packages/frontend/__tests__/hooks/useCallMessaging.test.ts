import { act, renderHook, waitFor } from '@testing-library/react';
import { RoomEvent } from 'livekit-client';
import type { Participant, Room } from 'livekit-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCallMessaging } from '../../src/hooks/useCallMessaging';

/**
 * A stand-in for the LiveKit Room that records what was published and can
 * replay inbound frames, so the wire protocol is exercised for real without
 * a server.
 */
function makeRoom(identity = 'me') {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const published: unknown[] = [];

  const room = {
    localParticipant: {
      identity,
      publishData: vi.fn(async (bytes: Uint8Array) => {
        published.push(JSON.parse(new TextDecoder().decode(bytes)));
      }),
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), handler]);
      return room;
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((h) => h !== handler)
      );
      return room;
    },
  } as unknown as Room;

  /** Delivers a frame as though it arrived from the other participant. */
  const receive = (payload: unknown, from = 'them', name = 'Them'): void => {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    for (const handler of listeners.get(RoomEvent.DataReceived) ?? []) {
      handler(bytes, { identity: from, name } as Participant);
    }
  };

  /** Delivers bytes verbatim, including a body that is not valid JSON. */
  const receiveRaw = (text: string, from = 'them'): void => {
    const bytes = new TextEncoder().encode(text);
    for (const handler of listeners.get(RoomEvent.DataReceived) ?? []) {
      handler(bytes, { identity: from, name: 'Them' } as Participant);
    }
  };

  return { room, published, receive, receiveRaw };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('chat', () => {
  it('shows a sent message immediately, since the sender never receives it back', async () => {
    const { room, published } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, true));

    await act(async () => {
      await result.current.sendChat('hello');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      text: 'hello',
      mine: true,
    });
    expect(published[0]).toMatchObject({ kind: 'chat', text: 'hello' });
  });

  it('publishes reliably, so a message cannot be silently dropped', async () => {
    const { room } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, true));

    await act(async () => {
      await result.current.sendChat('hi');
    });

    const publishData = room.localParticipant.publishData as ReturnType<
      typeof vi.fn
    >;
    expect(publishData.mock.calls[0][1]).toEqual({ reliable: true });
  });

  it('ignores an empty or whitespace-only message', async () => {
    const { room, published } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, true));

    await act(async () => {
      await result.current.sendChat('   ');
    });

    expect(result.current.messages).toHaveLength(0);
    expect(published).toHaveLength(0);
  });

  it('records an inbound message against its sender', async () => {
    const { room, receive } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, true));

    act(() => {
      receive({ kind: 'chat', id: 'a', text: 'from them', at: 1 });
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0]).toMatchObject({
      text: 'from them',
      from: 'Them',
      mine: false,
    });
  });

  it('counts unread only while the panel is closed', async () => {
    const { room, receive } = makeRoom();
    const { result, rerender } = renderHook(
      ({ open }) => useCallMessaging(room, open),
      { initialProps: { open: false } }
    );

    act(() => receive({ kind: 'chat', id: 'a', text: 'one', at: 1 }));
    await waitFor(() => expect(result.current.unread).toBe(1));

    rerender({ open: true });
    act(() => receive({ kind: 'chat', id: 'b', text: 'two', at: 2 }));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.unread).toBe(1);

    act(() => result.current.markRead());
    await waitFor(() => expect(result.current.unread).toBe(0));
  });

  it('survives a malformed frame rather than tearing down the call', async () => {
    const { room, receive, receiveRaw } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, true));

    // A peer on a different build, or a corrupted frame, must not throw out
    // of the event handler and take the call with it.
    act(() => receiveRaw('not json at all'));
    expect(result.current.messages).toHaveLength(0);

    // The channel still works afterwards.
    act(() => receive({ kind: 'chat', id: 'ok', text: 'still works', at: 1 }));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
  });

  it('ignores a frame with an unknown kind', async () => {
    const { room, receiveRaw } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, true));

    act(() => receiveRaw(JSON.stringify({ kind: 'from-the-future' })));

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.raisedHands).toHaveLength(0);
  });
});

describe('raised hands', () => {
  it('tracks a remote hand by identity, not display name', async () => {
    const { room, receive } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, false));

    act(() => receive({ kind: 'hand', raised: true }, 'student:229301001'));

    await waitFor(() =>
      expect(result.current.raisedHands).toEqual(['student:229301001'])
    );
  });

  it('does not duplicate a hand when the same raise arrives twice', async () => {
    const { room, receive } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, false));

    act(() => {
      receive({ kind: 'hand', raised: true }, 'a');
      receive({ kind: 'hand', raised: true }, 'a');
    });

    await waitFor(() => expect(result.current.raisedHands).toEqual(['a']));
  });

  it('clears only the hand that was lowered', async () => {
    const { room, receive } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, false));

    act(() => {
      receive({ kind: 'hand', raised: true }, 'a');
      receive({ kind: 'hand', raised: true }, 'b');
    });
    await waitFor(() => expect(result.current.raisedHands).toHaveLength(2));

    act(() => receive({ kind: 'hand', raised: false }, 'a'));
    await waitFor(() => expect(result.current.raisedHands).toEqual(['b']));
  });

  it('toggles the local hand and announces both directions', async () => {
    const { room, published } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, false));

    await act(async () => {
      await result.current.toggleHand();
    });
    expect(result.current.handRaised).toBe(true);

    await act(async () => {
      await result.current.toggleHand();
    });
    expect(result.current.handRaised).toBe(false);
    expect(published).toEqual([
      { kind: 'hand', raised: true },
      { kind: 'hand', raised: false },
    ]);
  });
});

describe('reactions', () => {
  it('expires a reaction so the call does not fill up with them', async () => {
    vi.useFakeTimers();
    const { room, receive } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, false));

    act(() => receive({ kind: 'reaction', id: 'r1', emoji: '👍' }));
    expect(result.current.reactions).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(result.current.reactions).toHaveLength(0);
    vi.useRealTimers();
  });
});

describe('recording notice and mute requests', () => {
  it('surfaces that the other side started recording', async () => {
    const { room, receive } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, false));

    act(() => receive({ kind: 'recording', active: true }));
    await waitFor(() => expect(result.current.remoteRecording).toBe(true));

    act(() => receive({ kind: 'recording', active: false }));
    await waitFor(() => expect(result.current.remoteRecording).toBe(false));
  });

  it('counts repeat mute requests, so a second ask is still actionable', async () => {
    const { room, receive } = makeRoom();
    const { result } = renderHook(() => useCallMessaging(room, false));

    act(() => receive({ kind: 'mute-request' }));
    await waitFor(() => expect(result.current.muteRequested).toBe(1));

    act(() => receive({ kind: 'mute-request' }));
    await waitFor(() => expect(result.current.muteRequested).toBe(2));
  });
});

describe('without a room', () => {
  it('does nothing rather than throwing before the call connects', async () => {
    const { result } = renderHook(() => useCallMessaging(null, false));

    await act(async () => {
      await result.current.sendChat('hello');
      await result.current.toggleHand();
    });

    expect(result.current.messages).toHaveLength(0);
  });
});
