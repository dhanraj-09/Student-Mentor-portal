import { randomBytes, randomUUID } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import { config } from '../../config.js';

/**
 * LiveKit access tokens.
 *
 * The API secret stays on the server: the browser only ever receives the short
 * lived JWT produced here, scoped to a single room and a single identity.
 */

export interface RoomTokenInput {
  roomName: string;
  /** Authenticated identity, never taken from the request body. */
  identity: string;
  displayName: string;
}

export interface RoomTokenResult {
  token: string;
  serverUrl: string;
  expiresAt: string;
}

export function isLiveKitConfigured(): boolean {
  return config.livekit.configured;
}

/**
 * Room names are server generated and unguessable, so knowing a meeting id can
 * never be turned into a joinable room.
 */
export function generateRoomName(meetingId: number | string): string {
  return `meeting_${meetingId}_${randomUUID()}_${randomBytes(6).toString('base64url')}`;
}

export async function createRoomToken(
  input: RoomTokenInput
): Promise<RoomTokenResult> {
  const ttlSeconds = config.livekit.tokenTtlSeconds;

  const accessToken = new AccessToken(
    config.livekit.apiKey,
    config.livekit.apiSecret,
    {
      identity: input.identity,
      name: input.displayName,
      ttl: ttlSeconds,
    }
  );

  accessToken.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    // The client must not be able to rename itself, create rooms, or
    // administer the SFU.
    canUpdateOwnMetadata: false,
    roomCreate: false,
    roomAdmin: false,
    roomList: false,
  });

  return {
    token: await accessToken.toJwt(),
    serverUrl: config.livekit.url,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}
