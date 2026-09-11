import { RoomEvent } from 'livekit-client';
import type { Participant, Room } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Chat, reactions, raised hands and the recording notice, all carried on the
 * room's data channel.
 *
 * The Room is created with `encryption` rather than the deprecated `e2ee`
 * option, which covers data messages as well as media — so everything here is
 * sealed with the same room key as the video. The server relays bytes it
 * cannot read.
 */

export interface ChatMessage {
  id: string;
  from: string;
  fromIdentity: string;
  text: string;
  at: number;
  mine: boolean;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  from: string;
}

type Wire =
  | { kind: 'chat'; id: string; text: string; at: number }
  | { kind: 'reaction'; id: string; emoji: string }
  | { kind: 'hand'; raised: boolean }
  | { kind: 'recording'; active: boolean }
  | { kind: 'mute-request' };

export const REACTIONS = ['👍', '👏', '🎉', '😂', '❤️', '🤔'] as const;

/** Long enough to notice, short enough not to litter the call. */
const REACTION_TTL_MS = 4000;
const MAX_CHAT = 200;
const MAX_TEXT_LENGTH = 2000;

export interface CallMessagingResult {
  messages: ChatMessage[];
  unread: number;
  markRead: () => void;
  sendChat: (text: string) => Promise<void>;
  reactions: FloatingReaction[];
  sendReaction: (emoji: string) => Promise<void>;
  handRaised: boolean;
  /** Identities of remote participants with a hand up. */
  raisedHands: string[];
  toggleHand: () => Promise<void>;
  /** Someone else is recording locally. */
  remoteRecording: boolean;
  announceRecording: (active: boolean) => Promise<void>;
  /** The mentor asked this browser to mute; consumed once. */
  muteRequested: number;
  requestMute: () => Promise<void>;
}

export function useCallMessaging(
  room: Room | null,
  chatOpen: boolean
): CallMessagingResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<string[]>([]);
  const [remoteRecording, setRemoteRecording] = useState(false);
  const [muteRequested, setMuteRequested] = useState(0);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  const publish = useCallback(
    async (payload: Wire): Promise<void> => {
      if (room === null) return;
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      await room.localParticipant.publishData(bytes, { reliable: true });
    },
    [room]
  );

  useEffect(() => {
    if (room === null) return;

    const onData = (payload: Uint8Array, from?: Participant): void => {
      let message: Wire;
      try {
        message = JSON.parse(new TextDecoder().decode(payload)) as Wire;
      } catch {
        // A malformed frame is not worth interrupting a call over.
        return;
      }

      const name = from?.name ?? from?.identity ?? 'Participant';
      const identity = from?.identity ?? '';

      switch (message.kind) {
        case 'chat': {
          setMessages((current) =>
            [
              ...current,
              {
                id: message.id,
                from: name,
                fromIdentity: identity,
                text: message.text.slice(0, MAX_TEXT_LENGTH),
                at: message.at,
                mine: false,
              },
            ].slice(-MAX_CHAT)
          );
          if (!chatOpenRef.current) setUnread((n) => n + 1);
          break;
        }
        case 'reaction': {
          const entry = { id: message.id, emoji: message.emoji, from: name };
          setReactions((current) => [...current, entry]);
          window.setTimeout(() => {
            setReactions((current) =>
              current.filter((item) => item.id !== entry.id)
            );
          }, REACTION_TTL_MS);
          break;
        }
        case 'hand': {
          setRaisedHands((current) =>
            message.raised
              ? current.includes(identity)
                ? current
                : [...current, identity]
              : current.filter((entry) => entry !== identity)
          );
          break;
        }
        case 'recording': {
          setRemoteRecording(message.active);
          break;
        }
        case 'mute-request': {
          // Bumping a counter lets the caller react to repeats of the same ask.
          setMuteRequested((n) => n + 1);
          break;
        }
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  const sendChat = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim().slice(0, MAX_TEXT_LENGTH);
      if (trimmed === '' || room === null) return;

      const entry: ChatMessage = {
        id: crypto.randomUUID(),
        from: 'You',
        fromIdentity: room.localParticipant.identity,
        text: trimmed,
        at: Date.now(),
        mine: true,
      };
      // Shown immediately: the sender never receives their own data message.
      setMessages((current) => [...current, entry].slice(-MAX_CHAT));
      await publish({
        kind: 'chat',
        id: entry.id,
        text: trimmed,
        at: entry.at,
      });
    },
    [publish, room]
  );

  const sendReaction = useCallback(
    async (emoji: string): Promise<void> => {
      const entry = { id: crypto.randomUUID(), emoji, from: 'You' };
      setReactions((current) => [...current, entry]);
      window.setTimeout(() => {
        setReactions((current) => current.filter((i) => i.id !== entry.id));
      }, REACTION_TTL_MS);
      await publish({ kind: 'reaction', id: entry.id, emoji });
    },
    [publish]
  );

  const toggleHand = useCallback(async (): Promise<void> => {
    const next = !handRaised;
    setHandRaised(next);
    await publish({ kind: 'hand', raised: next });
  }, [handRaised, publish]);

  const announceRecording = useCallback(
    async (active: boolean): Promise<void> => {
      await publish({ kind: 'recording', active });
    },
    [publish]
  );

  const requestMute = useCallback(async (): Promise<void> => {
    await publish({ kind: 'mute-request' });
  }, [publish]);

  const markRead = useCallback(() => setUnread(0), []);

  return {
    messages,
    unread,
    markRead,
    sendChat,
    reactions,
    sendReaction,
    handRaised,
    raisedHands,
    toggleHand,
    remoteRecording,
    announceRecording,
    muteRequested,
    requestMute,
  };
}
