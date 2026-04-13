// CC-Remote v4 — QR display utility
// Renders the current tunnel URL as an ASCII QR code for terminal display.
// Used by the server on startup and on tunnel URL change.
//
// Usage (standalone): node scripts/qr.js https://xxx.trycloudflare.com
// Usage (programmatic): import { printQR } from './scripts/qr.js'

import qrcode from 'qrcode';

export async function printQR(url) {
  if (!url) {
    console.log('[QR] URL なし、QR スキップ');
    return;
  }
  try {
    const ascii = await qrcode.toString(url, { type: 'terminal', small: true });
    console.log('');
    console.log('─'.repeat(60));
    console.log(`📱 スマホでこの QR を読み取ってアクセス: ${url}`);
    console.log('─'.repeat(60));
    console.log(ascii);
    console.log('─'.repeat(60));
    console.log('');
  } catch (e) {
    console.log(`[QR] 生成失敗: ${e.message}`);
    console.log(`[QR] URL: ${url}`);
  }
}

// CLI mode
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node scripts/qr.js <url>');
    process.exit(1);
  }
  await printQR(url);
}
