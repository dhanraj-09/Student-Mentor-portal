import { exportPublicKey, fingerprintOf, generateDeviceKeyPair } from './e2ee';
import type { DeviceKeyPair } from './e2ee';

/**
 * This browser's identity key pair for encrypted meetings.
 *
 * The private key is a non-extractable CryptoKey kept in IndexedDB: it can
 * unwrap room keys but cannot be read out by application code, uploaded, or
 * copied to another browser.
 */

const DB_NAME = 'marg-e2ee';
const DB_VERSION = 1;
const STORE = 'device-keys';
const RECORD_ID = 'default';

export interface StoredDeviceKey extends DeviceKeyPair {
  publicKeyBase64: string;
  fingerprint: string;
}

interface DeviceKeyRecord {
  id: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyBase64: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(
        new Error(
          'IndexedDB is unavailable, so the encryption key cannot be stored.'
        )
      );
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open IndexedDB.'));
  });
}

function runTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

let cached: StoredDeviceKey | null = null;
let pending: Promise<StoredDeviceKey> | null = null;

async function load(): Promise<StoredDeviceKey> {
  const db = await openDatabase();
  try {
    const existing = await runTransaction<DeviceKeyRecord | undefined>(
      db,
      'readonly',
      (store) => store.get(RECORD_ID) as IDBRequest<DeviceKeyRecord | undefined>
    );

    if (existing !== undefined && existing.publicKeyBase64 !== '') {
      return {
        privateKey: existing.privateKey,
        publicKey: existing.publicKey,
        publicKeyBase64: existing.publicKeyBase64,
        fingerprint: await fingerprintOf(existing.publicKeyBase64),
      };
    }

    const pair = await generateDeviceKeyPair();
    const publicKeyBase64 = await exportPublicKey(pair.publicKey);
    const record: DeviceKeyRecord = {
      id: RECORD_ID,
      privateKey: pair.privateKey,
      publicKey: pair.publicKey,
      publicKeyBase64,
    };
    await runTransaction(db, 'readwrite', (store) => store.put(record));

    return {
      ...pair,
      publicKeyBase64,
      fingerprint: await fingerprintOf(publicKeyBase64),
    };
  } finally {
    db.close();
  }
}

/** Returns this browser's key pair, generating it on first use. */
export async function getDeviceKey(): Promise<StoredDeviceKey> {
  if (cached !== null) return cached;
  if (pending === null) {
    pending = load()
      .then((key) => {
        cached = key;
        return key;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Wipes the device key, e.g. when signing out on a shared machine. */
export async function clearDeviceKey(): Promise<void> {
  cached = null;
  const db = await openDatabase();
  try {
    await runTransaction(db, 'readwrite', (store) => store.delete(RECORD_ID));
  } finally {
    db.close();
  }
}
