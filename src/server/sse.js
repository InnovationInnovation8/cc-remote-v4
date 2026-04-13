// SSE - Server-Sent Events for real-time session output
import { Router } from 'express';
import { getSession, filterLines } from './pty-manager.js';
import { isTokenValid } from './auth.js';

const sseRoutes = Router();

// GET /sse/:sessionId - SSE endpoint
sseRoutes.get('/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  const token = req.query.pin || req.headers['x-pin'];
  if (!token || !isTokenValid(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // SSE headers — must disable buffering for Cloudflare tunnel
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.flushHeaders();

  // Register this response as an SSE client (max 20 per session)
  if (!Array.isArray(session.sseClients)) {
    session.sseClients = [];
  }
  if (session.sseClients.length >= 20) {
    res.status(429).json({ error: 'Too many SSE connections' });
    return;
  }
  session.sseClients.push(res);
  session.lastCapture = '';

  // Keep-alive（15秒ごとにコメント送信でコネクション維持）
  const keepAlive = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch (_) { clearInterval(keepAlive); }
  }, 15000);

  // Remove client on connection close
  req.on('close', () => {
    clearInterval(keepAlive);
    if (Array.isArray(session.sseClients)) {
      const idx = session.sseClients.indexOf(res);
      if (idx !== -1) session.sseClients.splice(idx, 1);
    }
  });

  // Cloudflareバッファリング対策: 2KBパディングを先に送信
  // Cloudflareは最初のチャンクが一定サイズ以上になるまでバッファする
  res.write(`:${' '.repeat(2048)}\n\n`);

  // 接続確認
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId, status: session.status })}\n\n`);

  // 現在の画面を即座に送信
  if (session.screenBuf) {
    const screen = session.screenBuf.capture();
    const filtered = filterLines(screen);
    if (filtered.trim()) {
      res.write(`data: ${JSON.stringify({ type: 'screen', id: sessionId, text: filtered })}\n\n`);
    }
  }

  if (typeof res.flush === 'function') res.flush();
});

export { sseRoutes };
