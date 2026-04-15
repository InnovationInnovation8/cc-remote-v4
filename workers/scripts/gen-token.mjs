/**
 * テスト用 HMAC トークン生成スクリプト
 * 実行: node workers/scripts/gen-token.mjs <pcId> <secret>
 */
import { generateToken } from '../src/lib/hmac.js';

const pcId = process.argv[2] || 'test-pc-001';
const secret = process.argv[3] || 'cc-remote-hmac-secret-dev-only-2026';

const { token, expires_at } = await generateToken(pcId, secret);
console.log(JSON.stringify({ token, expires_at, expires_at_iso: new Date(expires_at).toISOString() }));
