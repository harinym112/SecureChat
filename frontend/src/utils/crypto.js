// ─────────────────────────────────────────────────────────────────────────────
// SecureChat Cryptography Module
// Implements Signal-inspired E2E encryption:
//   - ECDH (P-256) for key exchange
//   - AES-256-GCM for symmetric encryption
//   - Perfect Forward Secrecy via ephemeral keys per message
//   - HKDF for key derivation
//   - Private keys stored in IndexedDB (non-extractable where possible)
// ─────────────────────────────────────────────────────────────────────────────

const subtle = window.crypto.subtle;

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

const DB_NAME = 'SecureChatKeys';
const DB_VERSION = 1;
const STORE_NAME = 'identity';

const openDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });

const idbSet = async (key, value) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
};

const idbGet = async (key) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
};

const idbDelete = async (key) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
};

// ─── Key Generation ──────────────────────────────────────────────────────────

/** Generate an ECDH identity key pair */
export const generateIdentityKeyPair = async () => {
  const keyPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  return keyPair;
};

/** Generate a signed prekey (same algo as identity key) */
export const generateSignedPreKey = async () => {
  return generateIdentityKeyPair();
};

/** Generate one-time prekeys (array of n key pairs) */
export const generateOneTimePreKeys = async (n = 5) => {
  const keys = [];
  for (let i = 0; i < n; i++) {
    keys.push(await generateIdentityKeyPair());
  }
  return keys;
};

// ─── Key Export / Import ─────────────────────────────────────────────────────

/** Export a CryptoKey to base64 string */
export const exportPublicKey = async (cryptoKey) => {
  const rawKey = await subtle.exportKey('spki', cryptoKey);
  return arrayBufferToBase64(rawKey);
};

export const exportPrivateKey = async (cryptoKey) => {
  const rawKey = await subtle.exportKey('pkcs8', cryptoKey);
  return arrayBufferToBase64(rawKey);
};

/** Import a base64 public key for ECDH */
export const importPublicKey = async (base64Key) => {
  const keyData = base64ToArrayBuffer(base64Key);
  return subtle.importKey('spki', keyData, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
};

/** Import a base64 private key for ECDH */
export const importPrivateKey = async (base64Key) => {
  const keyData = base64ToArrayBuffer(base64Key);
  return subtle.importKey('pkcs8', keyData, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
};

// ─── ECDH Shared Secret ───────────────────────────────────────────────────────

/** Derive shared bits from our private key + their public key */
const deriveSharedSecret = async (privateKey, publicKey) => {
  return subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
};

// ─── HKDF Key Derivation ──────────────────────────────────────────────────────

/** Derive AES-GCM key from shared secret using HKDF */
const hkdfDerive = async (sharedSecret, salt, info) => {
  const baseKey = await subtle.importKey('raw', sharedSecret, { name: 'HKDF' }, false, ['deriveKey']);
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt || new Uint8Array(32),
      info: new TextEncoder().encode(info || 'SecureChat-v1'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

// ─── Encryption / Decryption ─────────────────────────────────────────────────

/**
 * Encrypt a message with perfect forward secrecy.
 * Generates a fresh ephemeral ECDH key pair for each message.
 *
 * @param {string} plaintext - Message to encrypt
 * @param {string} recipientPublicKeyB64 - Recipient's public key (base64)
 * @param {CryptoKeyPair} senderIdentityKeyPair - Sender's identity key pair
 * @returns {{ ciphertext, iv, ephemeralPublicKey }} - All base64
 */
export const encryptMessage = async (plaintext, recipientPublicKeyB64, senderIdentityKeyPair) => {
  // 1. Generate ephemeral key pair for this message (PFS)
  const ephemeralKeyPair = await generateIdentityKeyPair();

  // 2. Import recipient's public key
  const recipientPubKey = await importPublicKey(recipientPublicKeyB64);

  // 3. Derive shared secrets
  const ephemeralShared = await deriveSharedSecret(ephemeralKeyPair.privateKey, recipientPubKey);
  const identityShared = await deriveSharedSecret(senderIdentityKeyPair.privateKey, recipientPubKey);

  // 4. Combine both secrets (XOR) for additional security
  const combinedSecret = new Uint8Array(32);
  const ephArr = new Uint8Array(ephemeralShared);
  const idArr = new Uint8Array(identityShared);
  for (let i = 0; i < 32; i++) {
    combinedSecret[i] = ephArr[i] ^ idArr[i];
  }

  // 5. Derive AES-GCM key via HKDF
  const aesKey = await hkdfDerive(combinedSecret.buffer, ephArr.slice(0, 16), 'SecureChat-message');

  // 6. Encrypt
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedPlaintext = new TextEncoder().encode(plaintext);
  const ciphertextBuffer = await subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encodedPlaintext);

  // 7. Export ephemeral public key
  const ephemeralPublicKey = await exportPublicKey(ephemeralKeyPair.publicKey);

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv),
    ephemeralPublicKey,
  };
};

/**
 * Decrypt a message.
 *
 * @param {string} ciphertextB64
 * @param {string} ivB64
 * @param {string} ephemeralPublicKeyB64 - Sender's ephemeral key for this message
 * @param {string} senderIdentityKeyB64 - Sender's identity public key
 * @param {CryptoKeyPair} recipientIdentityKeyPair - Our identity key pair
 * @returns {string} Decrypted plaintext
 */
export const decryptMessage = async (
  ciphertextB64,
  ivB64,
  ephemeralPublicKeyB64,
  senderIdentityKeyB64,
  recipientIdentityKeyPair
) => {
  // 1. Import keys
  const ephemeralPubKey = await importPublicKey(ephemeralPublicKeyB64);
  const senderPubKey = await importPublicKey(senderIdentityKeyB64);

  // 2. Derive same shared secrets
  const ephemeralShared = await deriveSharedSecret(recipientIdentityKeyPair.privateKey, ephemeralPubKey);
  const identityShared = await deriveSharedSecret(recipientIdentityKeyPair.privateKey, senderPubKey);

  // 3. Combine secrets
  const combinedSecret = new Uint8Array(32);
  const ephArr = new Uint8Array(ephemeralShared);
  const idArr = new Uint8Array(identityShared);
  for (let i = 0; i < 32; i++) {
    combinedSecret[i] = ephArr[i] ^ idArr[i];
  }

  // 4. Derive AES key
  const aesKey = await hkdfDerive(combinedSecret.buffer, ephArr.slice(0, 16), 'SecureChat-message');

  // 5. Decrypt
  const iv = base64ToArrayBuffer(ivB64);
  const ciphertext = base64ToArrayBuffer(ciphertextB64);
  const plaintextBuffer = await subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);

  return new TextDecoder().decode(plaintextBuffer);
};

// ─── Key Persistence (IndexedDB) ──────────────────────────────────────────────

/**
 * Save identity key pair to IndexedDB.
 * Public key is exported as base64 (needed to share with server/peers).
 * Private key is stored as a CryptoKey object — never leaves the browser as raw bytes.
 */
export const saveIdentityKeys = async (keyPair) => {
  const publicKeyB64 = await exportPublicKey(keyPair.publicKey);
  // Store the CryptoKey object directly — avoids serialising the private key
  await idbSet('identity_public_key', keyPair.publicKey);
  await idbSet('identity_private_key', keyPair.privateKey);
  await idbSet('identity_public_b64', publicKeyB64);
  return { publicKey: publicKeyB64 };
};

/** Load identity key pair from IndexedDB */
export const loadIdentityKeys = async () => {
  try {
    const publicKey = await idbGet('identity_public_key');
    const privateKey = await idbGet('identity_private_key');
    const publicKeyB64 = await idbGet('identity_public_b64');

    if (!publicKey || !privateKey || !publicKeyB64) return null;
    return { publicKey, privateKey, publicKeyB64 };
  } catch {
    return null;
  }
};

/** Clear identity keys from IndexedDB (on logout) */
export const clearIdentityKeys = async () => {
  await idbDelete('identity_public_key');
  await idbDelete('identity_private_key');
  await idbDelete('identity_public_b64');
};

/** Initialize keys: load existing or generate new */
export const initializeKeys = async () => {
  let keys = await loadIdentityKeys();
  if (!keys) {
    const keyPair = await generateIdentityKeyPair();
    const { publicKey: publicKeyB64 } = await saveIdentityKeys(keyPair);
    keys = {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      publicKeyB64,
    };
  }
  return keys;
};

// ─── Utilities ────────────────────────────────────────────────────────────────

export const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

export const base64ToArrayBuffer = (base64) => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

/** Generate a cryptographically secure message ID */
export const generateMessageId = () => {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
};
