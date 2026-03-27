import { getMyChatCrypto, putMyChatPublicKey } from "../api/chat";

export const E2EE_PREFIX = "E2EE:v1:";

export function isE2eeEncryptedBody(body) {
  return typeof body === "string" && body.startsWith(E2EE_PREFIX);
}

function storageKeyForUser(userId) {
  return `zweck_chat_ecdh_jwk_${userId}`;
}

function uint8ToB64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function b64ToUint8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Load or create ECDH P-256 key pair; persists private material in localStorage (this browser only).
 */
export async function ensureLocalEcdhKeyPair(userId) {
  const key = storageKeyForUser(userId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.publicJwk && parsed?.privateJwk) return parsed;
    }
  } catch {
    /* ignore */
  }

  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const stored = { publicJwk, privateJwk };
  try {
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    /* ignore */
  }
  return stored;
}

async function importEcdhPrivateKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

async function importEcdhPublicKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

/**
 * Ensure local key exists and the server has our public key (register if missing or mismatched).
 */
export async function ensureRegisteredChatPublicKey(userId) {
  const { publicJwk, privateJwk } = await ensureLocalEcdhKeyPair(userId);
  let serverPub = null;
  try {
    const d = await getMyChatCrypto();
    serverPub = d?.publicKeyJwk ?? null;
  } catch {
    /* ignore */
  }
  const same = serverPub && JSON.stringify(publicJwk) === JSON.stringify(serverPub);
  if (!same) {
    await putMyChatPublicKey(publicJwk);
  }
  return { publicJwk, privateJwk };
}

/**
 * Derive AES-256-GCM key for this DM room (same for both participants).
 */
export async function deriveDmAesKey(privateJwk, peerPublicJwk, roomId) {
  const priv = await importEcdhPrivateKey(privateJwk);
  const peer = await importEcdhPublicKey(peerPublicJwk);
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, priv, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, { name: "HKDF" }, false, ["deriveKey"]);
  const salt = new TextEncoder().encode(`zweck-dm-e2ee:v1:room:${roomId}`);
  const info = new TextEncoder().encode("aes-256-gcm");
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptDmPlaintext(plaintext, aesKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, aesKey, enc.encode(plaintext))
  );
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv, 0);
  combined.set(ct, iv.length);
  return E2EE_PREFIX + uint8ToB64(combined);
}

export async function decryptDmCiphertext(ciphertext, aesKey) {
  if (!isE2eeEncryptedBody(ciphertext)) throw new Error("Not E2EE ciphertext");
  const raw = b64ToUint8(ciphertext.slice(E2EE_PREFIX.length));
  if (raw.length < 13) throw new Error("Truncated");
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, aesKey, ct);
  return new TextDecoder().decode(dec);
}
