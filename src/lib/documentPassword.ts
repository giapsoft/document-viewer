export const LOCK_FILE_NAME = 'lock.json';
export const PAYLOAD_FILE_NAME = 'payload.enc';
export const LOCK_VERSION = 1 as const;
export const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const VERIFIER_TEXT = 'document-viewer-lock-v1';

export interface DocumentLockFile {
  version: typeof LOCK_VERSION;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  verifier: string;
}

export function lockStoragePath(docId: string): string {
  return `${docId}/${LOCK_FILE_NAME}`;
}

export function payloadStoragePath(docId: string): string {
  return `${docId}/${PAYLOAD_FILE_NAME}`;
}

export const PUBLIC_SNAPSHOT_FILE_NAME = 'public.snapshot';

export function publicSnapshotStoragePath(docId: string): string {
  return `${docId}/${PUBLIC_SNAPSHOT_FILE_NAME}`;
}

export function isDocumentLockFile(value: unknown): value is DocumentLockFile {
  if (!value || typeof value !== 'object') return false;
  const lock = value as DocumentLockFile;
  return (
    lock.version === LOCK_VERSION &&
    lock.kdf === 'PBKDF2-SHA256' &&
    typeof lock.salt === 'string' &&
    typeof lock.verifier === 'string' &&
    typeof lock.iterations === 'number'
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function createDocumentLock(password: string): Promise<{
  lock: DocumentLockFile;
  key: CryptoKey;
}> {
  if (!password) {
    throw new Error('Password is required.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(VERIFIER_TEXT),
  );

  return {
    lock: {
      version: LOCK_VERSION,
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      verifier: bytesToBase64(concatBytes(iv, new Uint8Array(ciphertext))),
    },
    key,
  };
}

export async function unlockDocumentKey(
  password: string,
  lock: DocumentLockFile,
): Promise<CryptoKey | null> {
  if (!password) return null;

  try {
    const salt = base64ToBytes(lock.salt);
    const key = await deriveKey(password, salt, lock.iterations);
    const verifierBytes = base64ToBytes(lock.verifier);
    if (verifierBytes.length <= IV_BYTES) return null;

    const iv = verifierBytes.slice(0, IV_BYTES);
    const ciphertext = verifierBytes.slice(IV_BYTES);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext as BufferSource,
    );
    if (new TextDecoder().decode(plain) !== VERIFIER_TEXT) return null;
    return key;
  } catch {
    return null;
  }
}

export async function encryptDocumentPayload(
  key: CryptoKey,
  payloadBytes: Uint8Array,
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    payloadBytes as BufferSource,
  );
  return concatBytes(iv, new Uint8Array(ciphertext));
}

export async function decryptDocumentPayload(
  key: CryptoKey,
  encryptedBytes: Uint8Array,
): Promise<Uint8Array> {
  if (encryptedBytes.length <= IV_BYTES) {
    throw new Error('Encrypted payload is invalid.');
  }
  const iv = encryptedBytes.slice(0, IV_BYTES);
  const ciphertext = encryptedBytes.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext as BufferSource,
  );
  return new Uint8Array(plain);
}

export async function encryptDocumentWithPassword(
  password: string,
  payloadBytes: Uint8Array,
): Promise<{ lock: DocumentLockFile; encrypted: Uint8Array }> {
  const { lock, key } = await createDocumentLock(password);
  const encrypted = await encryptDocumentPayload(key, payloadBytes);
  return { lock, encrypted };
}

export async function decryptDocumentWithPassword(
  password: string,
  lock: DocumentLockFile,
  encryptedBytes: Uint8Array,
): Promise<Uint8Array> {
  const key = await unlockDocumentKey(password, lock);
  if (!key) {
    throw new Error('Incorrect password.');
  }
  return decryptDocumentPayload(key, encryptedBytes);
}

export function lockFileToBlob(lock: DocumentLockFile): Blob {
  return new Blob([`${JSON.stringify(lock, null, 2)}\n`], { type: 'application/json' });
}

export function encryptedPayloadToBlob(encrypted: Uint8Array): Blob {
  return new Blob([new Uint8Array(encrypted)], { type: 'application/octet-stream' });
}
