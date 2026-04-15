/**
 * HMAC-SHA256 短命トークン（15分TTL）
 *
 * Workers の Web Crypto API (crypto.subtle.sign) を使用。
 * Node.js crypto は使用しない（Workers 環境との互換のため）。
 *
 * トークン形式:
 *   base64url( pcId:expiresAt ) + "." + base64url( HMAC-SHA256 署名 )
 *
 * expiresAt: Unix ms タイムスタンプ
 */

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

// テキストエンコーダ（Workers / Node 両対応）
const encoder = new TextEncoder();

/**
 * secret 文字列から CryptoKey をインポートする
 * @param {string} secret
 * @returns {Promise<CryptoKey>}
 */
async function importKey(secret) {
  const keyData = encoder.encode(secret);
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * ArrayBuffer を base64url 文字列に変換
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
 * base64url 文字列を Uint8Array に変換
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
 * HMAC トークンを生成する
 * @param {string} pcId
 * @param {string} secret  env.HMAC_SECRET
 * @param {number} [now]   テスト用: 現在時刻を注入（省略時は Date.now()）
 * @returns {Promise<{ token: string, expires_at: number }>}
 */
export async function generateToken(pcId, secret, now = Date.now()) {
  const expires_at = now + TOKEN_TTL_MS;
  const payload = bufToBase64url(encoder.encode(`${pcId}:${expires_at}`));
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const token = `${payload}.${bufToBase64url(sig)}`;
  return { token, expires_at };
}

/**
 * HMAC トークンを検証する
 * @param {string} token
 * @param {string} pcId    期待する pcId
 * @param {string} secret  env.HMAC_SECRET
 * @param {number} [now]   テスト用: 現在時刻を注入（省略時は Date.now()）
 * @returns {Promise<boolean>}
 */
export async function verifyToken(token, pcId, secret, now = Date.now()) {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payload, sigStr] = parts;

  // ペイロードをデコードして pcId と expires_at を取り出す
  let decodedPayload;
  try {
    decodedPayload = new TextDecoder().decode(base64urlToUint8Array(payload));
  } catch {
    return false;
  }

  const colonIdx = decodedPayload.indexOf(':');
  if (colonIdx < 0) return false;

  const tokenPcId = decodedPayload.slice(0, colonIdx);
  const expiresAtStr = decodedPayload.slice(colonIdx + 1);
  const expires_at = parseInt(expiresAtStr, 10);

  // pcId 一致確認
  if (tokenPcId !== pcId) return false;

  // TTL チェック
  if (now > expires_at) return false;

  // HMAC 署名検証
  try {
    const key = await importKey(secret);
    let sigBytes;
    try {
      sigBytes = base64urlToUint8Array(sigStr);
    } catch {
      return false;
    }
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(payload)
    );
    return valid;
  } catch {
    return false;
  }
}
