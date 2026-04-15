/**
 * Signed state parameter for OAuth2 CSRF protection.
 * Uses HMAC-SHA256 via WebCrypto.
 *
 * Format: <base64url(json)>.<base64url(hmac-sha256)>
 *
 * Stateless signed state. Replay within maxAge window is theoretically possible
 * if an attacker intercepts the URL; mitigated by short TTL (10min) and HTTPS.
 * For stronger guarantees, store nonces in a DO with TTL.
 */

const encoder = new TextEncoder();

// ---- helpers ----

/**
 * ArrayBuffer → base64url string
 * @param {ArrayBuffer} buf
 * @returns {string}
 */
function bufToBase64url(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * base64url string → Uint8Array
 * @param {string} str
 * @returns {Uint8Array}
 */
function base64urlToUint8Array(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(pad));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Import a raw secret string as an HMAC-SHA256 CryptoKey.
 * @param {string} secret
 * @param {string[]} usages  ['sign'] or ['verify']
 * @returns {Promise<CryptoKey>}
 */
async function importHmacKey(secret, usages) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  );
}

// ---- public API ----

/**
 * Sign a state payload for OAuth2 CSRF protection.
 * Automatically injects `nonce` (16 random bytes hex) and `created_at` (ms).
 *
 * @param {object} payload  Additional fields to include (e.g. { redirect_to })
 * @param {string} secret
 * @returns {Promise<string>}  "<base64url(json)>.<base64url(sig)>"
 */
export async function signState(payload, secret) {
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const full = { ...payload, nonce, created_at: Date.now() };
  const jsonStr = JSON.stringify(full);
  const b64 = bufToBase64url(encoder.encode(jsonStr));

  const key = await importHmacKey(secret, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(b64));
  const sig = bufToBase64url(sigBuf);

  return `${b64}.${sig}`;
}

/**
 * Verify a signed state string.
 * @param {string} stateStr
 * @param {string} secret
 * @param {number} [maxAgeMs=600000]  10 minutes
 * @returns {Promise<object>}  decoded payload
 * @throws {Error} on HMAC failure, expiry, or format error
 */
export async function verifyState(stateStr, secret, maxAgeMs = 600_000) {
  if (!stateStr || typeof stateStr !== 'string') throw new Error('invalid state');

  const dotIdx = stateStr.lastIndexOf('.');
  if (dotIdx < 0) throw new Error('invalid state format');

  const b64 = stateStr.slice(0, dotIdx);
  const sigStr = stateStr.slice(dotIdx + 1);

  // Verify HMAC
  const key = await importHmacKey(secret, ['verify']);
  let sigBytes;
  try {
    sigBytes = base64urlToUint8Array(sigStr);
  } catch {
    throw new Error('invalid state signature encoding');
  }

  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(b64));
  if (!valid) throw new Error('state HMAC verification failed');

  // Decode payload
  let payload;
  try {
    const jsonStr = new TextDecoder().decode(base64urlToUint8Array(b64));
    payload = JSON.parse(jsonStr);
  } catch {
    throw new Error('invalid state payload');
  }

  // Check age
  if (!payload.created_at || typeof payload.created_at !== 'number') {
    throw new Error('state missing created_at');
  }
  const age = Date.now() - payload.created_at;
  if (age >= maxAgeMs) throw new Error(`state expired (age: ${age}ms)`);
  if (age < 0) throw new Error('state created_at is in the future');

  return payload;
}
