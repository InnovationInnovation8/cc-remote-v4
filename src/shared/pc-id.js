// Shared PC ID generation — consistent across server, agent, cloud modules
import os from 'os';
import crypto from 'crypto';

export function generatePCId() {
  const ascii = os.hostname().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ascii) return `pc-${ascii}`;
  // 非ASCII文字のみのホスト名（日本語等）→ MD5ハッシュをフォールバック
  const hash = crypto.createHash('md5').update(os.hostname()).digest('hex').slice(0, 8);
  return `pc-${hash}`;
}
