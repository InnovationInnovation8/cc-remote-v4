// Sessions - Session management REST API routes
import { Router } from 'express';
import {
  createSession,
  getSession,
  getAllSessions,
  deleteSession,
  sendInput,
  sendKey,
  renameSession,
  setSessionMemo,
  getSessionStatus,
  listClaudeSessions,
  resumeClaudeSession,
  filterLines,
} from './pty-manager.js';
import { getDB, saveDB } from './db.js';

const sessionRoutes = Router();

// GET /api/sessions - List all sessions
sessionRoutes.get('/', (req, res) => {
  try {
    const sessions = getAllSessions();
    const list = sessions.map(s => {
      const lastEntry = (s.outputHistory || []).slice(-1)[0] || '';
      const lastLine = lastEntry.split('\n').filter(l => l.trim()).pop() || '';
      const previewLine = lastLine.length > 50 ? lastLine.slice(0, 50) + '...' : lastLine;
      return {
        id: s.id,
        name: s.name,
        status: s.status,
        memo: s.memo || '',
        pinned: !!s.pinned,
        archived: !!s.archived,
        approvalLevel: s.approvalLevel || 'easy',
        tags: s.tags || '',
        createdAt: s.createdAt,
        previewLine,
      };
    });
    res.json(list);
  } catch (err) {
    console.error('[Sessions] 一覧取得エラー:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// POST /api/sessions - Create new session
sessionRoutes.post('/', async (req, res) => {
  const { name } = req.body;
  try {
    const session = await createSession(name || 'New Session');
    res.status(201).json({
      id: session.id,
      name: session.name,
      status: session.status,
      memo: session.memo || '',
      createdAt: session.createdAt,
    });
  } catch (err) {
    console.error('[Sessions] セッション作成エラー:', err);
    const status = err.message.includes('上限') ? 429 : 500;
    res.status(status).json({ error: err.message });
  }
});

// GET /api/sessions/claude-history - List existing Claude Code sessions
// Auth: authMiddleware is applied globally via `app.use('/api', authMiddleware)` in index.js.
// (Architect final review Priority 3: comment added to prevent "no-auth" misreading.)
sessionRoutes.get('/claude-history', (req, res) => {
  try {
    const sessions = listClaudeSessions();
    res.json(sessions);
  } catch (err) {
    console.error('[Sessions] Claude履歴取得エラー:', err);
    res.status(500).json({ error: 'Failed to list Claude sessions' });
  }
});

// POST /api/sessions/resume - Resume existing Claude Code session
// Rev 5 REV5-001: projectCwd を受け取って PTY の cwd に使う。
sessionRoutes.post('/resume', async (req, res) => {
  const { claudeSessionId, name, projectCwd } = req.body;
  if (!claudeSessionId) {
    return res.status(400).json({ error: 'claudeSessionId is required' });
  }
  try {
    const session = await resumeClaudeSession(claudeSessionId, name, projectCwd);
    res.status(201).json({
      id: session.id,
      name: session.name,
      status: session.status,
      memo: session.memo || '',
      createdAt: session.createdAt,
    });
  } catch (err) {
    console.error('[Sessions] セッション再開エラー:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:id - Get session details + recent output
sessionRoutes.get('/:id', (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const claudeStatus = getSessionStatus(req.params.id);
    const claudeReady = !!session.claudeReady;
    // Rev 6: スクロールバック拡張 — 旧 capture() は現在画面 (50 行) だけ返していた。
    // captureAll() で scrollback + 現在画面 を返し、末尾 500 行で payload サイズをキャップする。
    const rawScreen = session.screenBuf
      ? session.screenBuf.captureAll()
      : '';
    const filtered = claudeReady ? filterLines(rawScreen) : '';
    const SCROLLBACK_MAX_LINES = 500;
    const filteredLines = filtered ? filtered.split('\n') : [];
    const recentOutput = filteredLines.length > SCROLLBACK_MAX_LINES
      ? filteredLines.slice(-SCROLLBACK_MAX_LINES).join('\n')
      : filtered;

    res.json({
      id: session.id,
      name: session.name,
      status: session.status,
      claudeStatus,
      claudeReady,
      memo: session.memo || '',
      createdAt: session.createdAt,
      recentOutput,
      contextUsage: session.contextUsage ?? 0,
    });
  } catch (err) {
    console.error('[Sessions] セッション取得エラー:', err);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// DELETE /api/sessions/:id - Delete session
sessionRoutes.delete('/:id', async (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    await deleteSession(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Sessions] セッション削除エラー:', err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// PATCH /api/sessions/:id - Update session (name, memo, pinned, archived, approvalLevel)
sessionRoutes.patch('/:id', (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { name, memo, pinned, archived, approvalLevel } = req.body;

    if (name !== undefined) {
      renameSession(req.params.id, name);
    }
    if (memo !== undefined) {
      setSessionMemo(req.params.id, memo);
    }
    if (pinned !== undefined) {
      session.pinned = pinned ? 1 : 0;
      try {
        const db = getDB();
        db.run('UPDATE sessions SET pinned = ? WHERE id = ?', [session.pinned, req.params.id]);
        saveDB();
      } catch (_) {}
    }
    if (archived !== undefined) {
      session.archived = archived ? 1 : 0;
      try {
        const db = getDB();
        db.run('UPDATE sessions SET archived = ? WHERE id = ?', [session.archived, req.params.id]);
        saveDB();
      } catch (_) {}
    }
    if (req.body.tags !== undefined) {
      session.tags = req.body.tags;
      try {
        const db = getDB();
        db.run('UPDATE sessions SET tags = ? WHERE id = ?', [req.body.tags, req.params.id]);
        saveDB();
      } catch (_) {}
    }
    if (approvalLevel !== undefined && ['easy', 'normal', 'hard'].includes(approvalLevel)) {
      session.approvalLevel = approvalLevel;
      session.autoApprove = approvalLevel === 'easy';
      try {
        const db = getDB();
        db.run('UPDATE sessions SET approval_level = ? WHERE id = ?', [approvalLevel, req.params.id]);
        saveDB();
      } catch (err) {
        console.error('[Sessions] approvalLevel DB書き込みエラー:', err && err.message ? err.message : String(err));
      }
    }

    const updated = getSession(req.params.id);
    res.json({
      id: updated.id,
      name: updated.name,
      status: updated.status,
      memo: updated.memo || '',
      pinned: !!updated.pinned,
      archived: !!updated.archived,
      approvalLevel: updated.approvalLevel || 'easy',
      createdAt: updated.createdAt,
    });
  } catch (err) {
    console.error('[Sessions] セッション更新エラー:', err);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// POST /api/sessions/:id/input - Send text input
sessionRoutes.post('/:id/input', async (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let { text } = req.body;
    if (typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required' });
    }
    if (text.length > 100000) {
      return res.status(400).json({ error: 'Input too large (max 100KB)' });
    }

    // AIキャラprefixを付与（特殊キーやスラッシュコマンドは除外）
    try {
      const { getCharacterPrefix } = await import('./index.js');
      const prefix = getCharacterPrefix();
      const trimmed = text.replace(/\r$/, '').trim();
      if (prefix && trimmed && !trimmed.startsWith('/') && !trimmed.startsWith('y') && !trimmed.startsWith('n') && trimmed.length > 3) {
        text = prefix + ' ' + text;
      }
    } catch (_) {}

    sendInput(req.params.id, text);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Sessions] 入力送信エラー:', err);
    res.status(500).json({ error: 'Failed to send input' });
  }
});

// POST /api/sessions/:id/key - Send special key
sessionRoutes.post('/:id/key', (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { key } = req.body;
    if (typeof key !== 'string') {
      return res.status(400).json({ error: 'key is required' });
    }

    sendKey(req.params.id, key);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Sessions] キー送信エラー:', err);
    res.status(500).json({ error: 'Failed to send key' });
  }
});

// GET /api/sessions/:id/export - Export full output history as plain text
sessionRoutes.get('/:id/export', (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const history = session.outputHistory || [];
    const text = history.join('\n');

    res.json({
      text,
      name: session.name,
      exportedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Sessions] エクスポートエラー:', err);
    res.status(500).json({ error: 'Failed to export session' });
  }
});

// GET /api/sessions/:id/search - Search session output history
sessionRoutes.get('/:id/search', (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const q = req.query.q;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'q (query) is required' });
    }

    const allText = session.screenBuf ? session.screenBuf.captureAll() : '';
    const lines = allText.split('\n');
    const lowerQ = q.toLowerCase();
    const matches = lines
      .map((line, idx) => ({ line, lineNumber: idx + 1 }))
      .filter(({ line }) => line.toLowerCase().includes(lowerQ));

    res.json({ query: q, matches, total: matches.length });
  } catch (err) {
    console.error('[Sessions] 検索エラー:', err);
    res.status(500).json({ error: 'Failed to search session' });
  }
});

// GET /api/sessions/:id/poll - Polling fallback for SSE (Cloudflare tunnel)
sessionRoutes.get('/:id/poll', (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const since = parseInt(req.query.since) || 0;
    const history = session.outputHistory || [];
    const newLines = since < history.length ? history.slice(since) : [];
    const claudeStatus = getSessionStatus(req.params.id);

    // Include current screen on first poll (since=0) like SSE connected event
    let screen = '';
    if (since === 0 && session.screenBuf) {
      screen = session.screenBuf.capture();
    }

    res.json({
      lines: newLines,
      screen,
      total: history.length,
      status: session.status,
      claudeStatus,
    });
  } catch (err) {
    console.error('[Sessions] ポーリングエラー:', err);
    res.status(500).json({ error: 'Failed to poll session' });
  }
});

// GET /api/sessions/:id/screen - Get current screen buffer capture
sessionRoutes.get('/:id/screen', (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const screen = session.screenBuf ? session.screenBuf.capture() : '';
    const scrollback = session.screenBuf ? session.screenBuf.scrollback : [];

    res.json({
      sessionId: req.params.id,
      screen,
      scrollbackLines: scrollback.length,
      cursorRow: session.screenBuf ? session.screenBuf.cursorRow : 0,
      cursorCol: session.screenBuf ? session.screenBuf.cursorCol : 0,
    });
  } catch (err) {
    console.error('[Sessions] スクリーン取得エラー:', err);
    res.status(500).json({ error: 'Failed to get screen' });
  }
});

export { sessionRoutes };
