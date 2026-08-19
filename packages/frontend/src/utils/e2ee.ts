/**
 * End-to-end encryption for meeting calls.
 *
 * Nothing here is home-grown cryptography: it is the standard ECIES
 * arrangement built from Web Crypto primitives - ephemeral ECDH on P-256,
 * HKDF-SHA256 for key derivation and AES-256-GCM for the sealed payload. The
 * room key it protects is what LiveKit uses to encrypt media frames on the
 * device, before anything reaches the network.
 */

export const E2EE = {
  KEY_ALGORITHM: 'ECDH',
  CURVE: 'P-256',
  KDF: 'HKDF',
  KDF_HASH: 'SHA-256',
  KDF_INFO: 'pbl3-meeting-room-key-v1',
  WRAP_ALGORITHM: 'AES-GCM',
  WRAP_KEY_BITS: 256,
  IV_BYTES: 12,
  SALT_BYTES: 32,
  ROOM_KEY_BYTES: 32,
  /** LiveKit keyring size; each generation takes its own slot. */
  KEYRING_SIZE: 16,
} as const;

export interface SealedEnvelope {
  ephemeral_public_key: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface DeviceKeyPair {
  /** Non-extractable: usable, but it can never be read back out. */
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

function subtle(): SubtleCrypto {
  const webcrypto = globalThis.crypto;
  if (webcrypto?.subtle === undefined) {
    throw new Error(
      'Web Crypto is unavailable. Open the portal over HTTPS (or http://localhost) in a modern browser.'
    );
  }
  return webcrypto.subtle;
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function generateDeviceKeyPair(): Promise<DeviceKeyPair> {
  const pair = await subtle().generateKey(
    { name: E2EE.KEY_ALGORITHM, namedCurve: E2EE.CURVE },
    false,
    ['deriveBits']
  );
  return { privateKey: pair.privateKey, publicKey: pair.publicKey };
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  return toBase64(await subtle().exportKey('spki', key));
}

export async function importPublicKey(base64: string): Promise<CryptoKey> {
  return subtle().importKey(
    'spki',
    asBuffer(fromBase64(base64)),
    { name: E2EE.KEY_ALGORITHM, namedCurve: E2EE.CURVE },
    true,
    []
  );
}

/** Human comparable fingerprint; the backend computes the same string. */
export async function fingerprintOf(publicKeyBase64: string): Promise<string> {
  const digest = await subtle().digest(
    'SHA-256',
    asBuffer(fromBase64(publicKeyBase64))
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return (hex.slice(0, 32).match(/.{4}/g) ?? []).join(' ');
}

/** Cryptographically random room key. It never leaves the device in the clear. */
export function generateRoomKey(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(E2EE.ROOM_KEY_BYTES));
}

/**
 * Context bound into the KDF and used as AEAD associated data, so an envelope
 * cannot be replayed against a different meeting, generation or recipient.
 */
function envelopeContext(
  meetingId: number,
  keyVersion: number,
  recipientPublicKey: string,
  ephemeralPublicKey: string
): string {
  return [
    E2EE.KDF_INFO,
    String(meetingId),
    String(keyVersion),
    recipientPublicKey,
    ephemeralPublicKey,
  ].join('|');
}

async function deriveWrappingKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  salt: Uint8Array,
  context: string
): Promise<CryptoKey> {
  const sharedSecret = await subtle().deriveBits(
    { name: E2EE.KEY_ALGORITHM, public: publicKey },
    privateKey,
    256
  );
  const material = await subtle().importKey(
    'raw',
    sharedSecret,
    E2EE.KDF,
    false,
    ['deriveKey']
  );
  return subtle().deriveKey(
    {
      name: E2EE.KDF,
      hash: E2EE.KDF_HASH,
      salt: asBuffer(salt),
      info: new TextEncoder().encode(context),
    },
    material,
    { name: E2EE.WRAP_ALGORITHM, length: E2EE.WRAP_KEY_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface SealOptions {
  roomKey: Uint8Array;
  recipientPublicKey: string;
  meetingId: number;
  keyVersion: number;
}

/** Seals the room key to one recipient's public key. */
export async function sealRoomKey(
  options: SealOptions
): Promise<SealedEnvelope> {
  const recipientKey = await importPublicKey(options.recipientPublicKey);
  const ephemeral = await subtle().generateKey(
    { name: E2EE.KEY_ALGORITHM, namedCurve: E2EE.CURVE },
    true,
    ['deriveBits']
  );
  const ephemeralPublicKey = await exportPublicKey(ephemeral.publicKey);
  const salt = globalThis.crypto.getRandomValues(
    new Uint8Array(E2EE.SALT_BYTES)
  );
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(E2EE.IV_BYTES));
  const context = envelopeContext(
    options.meetingId,
    options.keyVersion,
    options.recipientPublicKey,
    ephemeralPublicKey
  );

  const wrappingKey = await deriveWrappingKey(
    ephemeral.privateKey,
    recipientKey,
    salt,
    context
  );
  const ciphertext = await subtle().encrypt(
    {
      name: E2EE.WRAP_ALGORITHM,
      iv: asBuffer(iv),
      additionalData: new TextEncoder().encode(context),
    },
    wrappingKey,
    asBuffer(options.roomKey)
  );

  return {
    ephemeral_public_key: ephemeralPublicKey,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
}

export interface OpenOptions {
  envelope: SealedEnvelope;
  recipientPublicKey: string;
  privateKey: CryptoKey;
  meetingId: number;
  keyVersion: number;
}

/** Opens an envelope sealed to this device. Throws if it was not meant for us. */
export async function openRoomKey(options: OpenOptions): Promise<Uint8Array> {
  const ephemeralKey = await importPublicKey(
    options.envelope.ephemeral_public_key
  );
  const context = envelopeContext(
    options.meetingId,
    options.keyVersion,
    options.recipientPublicKey,
    options.envelope.ephemeral_public_key
  );
  const wrappingKey = await deriveWrappingKey(
    options.privateKey,
    ephemeralKey,
    fromBase64(options.envelope.salt),
    context
  );

  const plaintext = await subtle().decrypt(
    {
      name: E2EE.WRAP_ALGORITHM,
      iv: asBuffer(fromBase64(options.envelope.iv)),
      additionalData: new TextEncoder().encode(context),
    },
    wrappingKey,
    asBuffer(fromBase64(options.envelope.ciphertext))
  );

  const roomKey = new Uint8Array(plaintext);
  if (roomKey.byteLength !== E2EE.ROOM_KEY_BYTES) {
    throw new Error('Decrypted room key has an unexpected length.');
  }
  return roomKey;
}
