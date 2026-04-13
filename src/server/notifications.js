// CC-Remote v4 — Notifications stub
// v3 では Firebase Cloud Messaging で push 通知を送っていたが、v4 は中央サーバーなし。
// pty-manager.js / watchdog.js から sendNotification(title, body) が呼ばれるため
// API 互換のため no-op stub を提供する（コンソール出力のみ）。
// 本格的な通知が必要になったら Web Push API（各PC→各スマホ直接）を v4.1+ で実装。

export async function sendNotification(title, body) {
  console.log(`[Notify] ${title}: ${body}`);
  return { ok: true, stub: true };
}
