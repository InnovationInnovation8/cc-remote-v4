// PTY Session Manager — CC Remote v3
import crypto from 'crypto';
import * as nodePty from 'node-pty';
import ScreenBuffer from './screen-buffer.js';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { getDB, saveDB } from './db.js';
import { sendNotification } from './notifications.js';
import { restoreSleep, isSleepDisabled } from './sleep-control.js';
import { notifyEvent as chatworkNotify } from './chatwork.js';

const MAX_SESSIONS = 5;

/** @type {Map<string, object>} */
const sessions = new Map();

// ---------------------------------------------------------------------------
// Helper — strip ANSI escape codes
// ---------------------------------------------------------------------------
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b[()][A-B0-9]|\x1b[DEHMNOST78]|\x9b[0-9;]*[A-Za-z]/g;

function stripAnsi(text) {
  return text.replace(ANSI_RE, '');
}

// ---------------------------------------------------------------------------
// filterLines — ported from v2.0, removes TUI decorations
// ---------------------------------------------------------------------------
const BOX_DRAWING_RE = /[─━═│┌┐└┘├┤┬┴┼╭╮╰╯╔╗╚╝╠╣╦╩╬▔▕]/;
const TUI_INDICATOR_RE = /[▐▌▛▜█▀▄░▒▓⏵⏴]/;

export function filterLines(text) {
  const lines = text.split('\n');
  const filtered = [];

  for (const raw of lines) {
    const stripped = stripAnsi(raw);
    const trimmed = stripped.trim();

    if (!trimmed) { filtered.push(''); continue; }

    // Remove lines that are ONLY box-drawing / TUI decoration (no meaningful text)
    const withoutDecor = trimmed.replace(/[─━═│┌┐└┘├┤┬┴┼╭╮╰╯╔╗╚╝╠╣╦╩╬▔▕▐▌▛▜█▀▄░▒▓⏵⏴\s]/g, '');
    if (withoutDecor.length === 0) continue;

    // Remove "bypass permissions" lines
    if (/bypass\s+permissions/i.test(trimmed)) continue;

    // Remove "shift+tab to cycle" lines
    if (/shift\+tab\s+to\s+cycle/i.test(trimmed)) continue;

    // Remove effort level lines
    if (/\b(effort|level)\s*[:：]?\s*(medium|high|low)\b/i.test(trimmed)) continue;
    if (/^(medium|high|low)\s+effort$/i.test(trimmed)) continue;

    // Remove thinking status lines
    if (/^(thinking|思考中|考え中)\.{0,3}$/i.test(trimmed)) continue;

    // Remove Windows cmd prompt lines  (e.g. "C:\...>")
    if (/^[A-Za-z]:\\.*>/.test(trimmed)) continue;

    // Remove "Now using extra usage" lines
    if (/now using extra usage/i.test(trimmed)) continue;

    // Remove session limit / usage info lines
    if (/session limit resets/i.test(trimmed)) continue;
    if (/You're now using/i.test(trimmed)) continue;

    // Remove chcp command
    if (/^chcp\s+\d+/i.test(trimmed)) continue;

    // Remove "claude" standalone command
    if (/^claude$/i.test(trimmed)) continue;

    // Remove Microsoft Windows version lines
    if (/Microsoft Windows \[Version/i.test(trimmed)) continue;
    if (/\(c\) Microsoft Corporation/i.test(trimmed)) continue;

    // Remove Claude Code thinking animation words (standalone)
    if (/^(?:Flamb|Smoosh|Flibbert|Percolat|Cogitat|Ponderi|Shimmy|Mull|Noodl|Churn|Brew|Stew|Rumina|Musing|Doodl|Tinker|Whisk|Juggl|Sizzl|Marina)/i.test(trimmed) && trimmed.length < 30) continue;

    // Remove lines that are mostly decoration with tiny text fragments
    if (withoutDecor.length < 3 && trimmed.length > 20) continue;

    // Remove shortcut hints
    if (/^\?\s*(for shortcuts|shortcuts)/i.test(trimmed)) continue;
    if (/for shortcuts$/i.test(trimmed)) continue;

    // Remove Claude Code version/model info lines
    if (/Claude Code v\d/i.test(trimmed)) continue;
    if (/^(Opus|Sonnet|Haiku)\s+\d/i.test(trimmed) && trimmed.length < 60) continue;

    // Remove standalone slash commands at end of screen (e.g. /buddy)
    if (/^\/[a-z-]+$/i.test(trimmed)) continue;

    // Remove "Enter to confirm" / "Esc to cancel" instruction lines
    if (/^Enter to confirm/i.test(trimmed)) continue;
    if (/^Esc to cancel/i.test(trimmed)) continue;
    if (/Enter to confirm.*Esc to cancel/i.test(trimmed)) continue;

    // Remove Security guide link
    if (/^Security guide$/i.test(trimmed)) continue;

    // Remove AI character prefixes (zero-width wrapped)
    if (/\u200B\[.*?\]\u200B/.test(trimmed)) continue;
    if (/^\[Reply /.test(trimmed)) continue;

    filtered.push(stripped);
  }

  // Collapse 3+ consecutive blank lines to 2
  let result = filtered.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

// ---------------------------------------------------------------------------
// Context usage estimation — based on outputHistory char count
// 4 chars ≈ 1 token, Claude Code context limit ≈ 200K tokens
// ---------------------------------------------------------------------------
const CTX_LIMIT_TOKENS = 200_000;
const CHARS_PER_TOKEN = 4;

export function estimateContextUsage(outputHistory) {
  const totalChars = outputHistory.reduce((sum, entry) => sum + entry.length, 0);
  const estimatedTokens = totalChars / CHARS_PER_TOKEN;
  const pct = Math.min(100, Math.round((estimatedTokens / CTX_LIMIT_TOKENS) * 100));
  return pct;
}

// ---------------------------------------------------------------------------
// Status detection — returns a status string or '' for idle
// ---------------------------------------------------------------------------
export function detectStatus(screenText) {
  const lines = screenText.split('\n');

  for (const line of lines) {
    const t = stripAnsi(line).trim();

    if (/Thinking|Cogitat|Ponderi|Mull|Musing|Noodl/i.test(t)) return '思考中...';
    if (/Search|Flamb|Percolat/i.test(t)) return '検索中...';
    if (/Reading|Read \d+ file/i.test(t)) return '読込中...';
    if (/Update\(|Edit\(/i.test(t)) return '編集中...';
    if (/Bash\(/i.test(t)) return 'コマンド実行中...';
    if (/Agent\(/i.test(t)) return 'エージェント実行中...';
  }

  // Idle: ❯ prompt at the end of the visible screen
  const lastMeaningful = lines.filter(l => stripAnsi(l).trim()).pop() || '';
  if (/❯\s*$/.test(stripAnsi(lastMeaningful))) return '';

  return '';
}

// ---------------------------------------------------------------------------
// Unique ID generator
// ---------------------------------------------------------------------------
function makeId() {
  return `sess_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// SSE broadcast helper
// ---------------------------------------------------------------------------
function broadcastSSE(session, event, data) {
  const msg = { type: event, ...data };
  const payload = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of session.sseClients) {
    try {
      res.write(payload);
      if (typeof res.flush === 'function') res.flush();
    } catch (_) { /* client disconnected */ }
  }
}

// ---------------------------------------------------------------------------
// 250ms poll — get new scrollback, filter, detect status, broadcast SSE
// ---------------------------------------------------------------------------
function startPoll(session) {
  session.pollTimer = setInterval(() => {
    try {
      // Check scrollback for new lines
      const newLines = session.screenBuf.getNewScrollback(session.scrollbackSentIndex);
      if (newLines.length > 0) {
        session.scrollbackSentIndex += newLines.length;
        const raw = newLines.join('\n');
        const filtered = filterLines(raw);
        if (filtered.trim()) {
          session.outputHistory.push(filtered);
          if (session.outputHistory.length > 500) session.outputHistory.shift();

          session.contextUsage = estimateContextUsage(session.outputHistory);

          if (session.sseClients.length > 0) {
            broadcastSSE(session, 'output', { id: session.id, text: filtered });
          }
        }
      }

      // Check current screen — send filtered screen as replacement
      const screen = session.screenBuf.capture();

      // Claude ready detection — runs on EVERY poll
      if (!session.claudeReady && session.ptyProcess) {
        const plain = stripAnsi(screen);
        if (/❯/.test(plain)) {
          session.claudeReady = true;
          console.log(`[PTY] Claude ready [${session.id}]`);
        }
      }

      if (screen !== session.lastCapture) {
        session.lastCapture = screen;
        const filtered = filterLines(screen);
        if (filtered.trim() && session.sseClients.length > 0) {
          broadcastSSE(session, 'screen', { id: session.id, text: filtered });
        }

        const status = detectStatus(screen);
        if (status !== session.status) {
          const prevStatus = session.status;
          session.status = status;
          saveSession(session);
          if (session.sseClients.length > 0) {
            broadcastSSE(session, 'status', { id: session.id, status });
          }
          // 作業中→idle に変わったら完了通知 + 就寝モード自動解除 + Chatwork
          if (prevStatus && !status && session.claudeReady) {
            sendNotification('タスク完了', `${session.name}: Claudeの作業が完了しました`, { sessionId: session.id }).catch(() => {});
            // Rev 5: Chatwork 通知
            chatworkNotify('task_complete', `${session.name}: Claudeの作業が完了しました`).catch(() => {});
            if (isSleepDisabled()) {
              restoreSleep();
              console.log(`[PTY] タスク完了 → 就寝モード自動解除 [${session.id}]`);
            }
          }
        }

        // Approval level handling (trust promptは起動中でも反応)
        // 同じ画面に対して1回だけ自動応答するガード
        if (session.ptyProcess) {
          const approvalPatterns = [
            /Do you want to proceed\?/i,
            /Allow this action\?/i,
            /\(y\/n\)/i,
            /\[Y\/n\]/i,
            /Press Enter to continue/i,
            /Do you trust the authors/i,
            /Yes, proceed/i,
          ];
          const needsApproval = approvalPatterns.some(pat => pat.test(screen));
          if (needsApproval && session._lastAutoApproveScreen !== screen) {
            session._lastAutoApproveScreen = screen;
            const level = session.approvalLevel || 'easy';
            if (level === 'easy' || !session.claudeReady) {
              // EASY: 自動承認（1回のみ）
              try {
                session.ptyProcess.write('y\r');
                console.log(`[PTY] EASY auto-approve [${session.id}]`);
              } catch (_) {}
            } else if (level === 'normal') {
              // NORMAL: 通知で確認を促す（自動承認しない）
              if (!session._lastApprovalNotify || Date.now() - session._lastApprovalNotify > 30000) {
                session._lastApprovalNotify = Date.now();
                sendNotification('承認待ち', `${session.name}: 操作の許可が必要です`, { sessionId: session.id }).catch(() => {});
                // Rev 5: Chatwork にも通知
                chatworkNotify('task_error', `${session.name}: 承認待ちです`).catch(() => {});
                console.log(`[PTY] NORMAL approval-needed [${session.id}]`);
              }
            } else if (level === 'hard') {
              // HARD: 自動拒否（1回のみ）
              try {
                session.ptyProcess.write('n\r');
                console.log(`[PTY] HARD auto-reject [${session.id}]`);
              } catch (_) {}
            }
          } else if (!needsApproval) {
            session._lastAutoApproveScreen = null; // 画面変わったらリセット
          }
        }
      }
    } catch (err) {
      console.error(`[PTY] poll error [${session.id}]:`, err.message);
    }
  }, 250);
}

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------
export async function createSession(name = 'New Session') {
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(`セッション数上限(${MAX_SESSIONS})に達しています`);
  }

  const id = makeId();
  const screenBuf = new ScreenBuffer(220, 50);

  const ptyProcess = nodePty.spawn('cmd.exe', ['/k', 'chcp 65001 >nul'], {
    name: 'xterm-256color',
    cols: 220,
    rows: 50,
    cwd: os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  const session = {
    id,
    name,
    memo: '',
    screenBuf,
    outputHistory: [],
    sseClients: [],
    scrollbackSentIndex: 0,
    lastCapture: '',
    ptyProcess,
    pollTimer: null,
    status: '起動中...',
    createdAt: Date.now(),
    autoApprove: true, // EASY mode default
    approvalLevel: 'easy',
    claudeReady: false, // true after Claude Code UI detected
    contextUsage: 0, // 0-100 percent estimate
  };

  ptyProcess.onData(data => {
    screenBuf.write(data);
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.log(`[PTY] session [${id}] exited with code ${exitCode}`);
    session.status = 'exited';
    clearInterval(session.pollTimer);
    saveSession(session);
    broadcastSSE(session, 'status', { id, status: 'exited' });
  });

  sessions.set(id, session);
  startPoll(session);

  // Launch claude after delay
  // 自走化対応: CC_REMOTE_SKIP_PERMISSIONS=1 で --dangerously-skip-permissions を付与
  // 承認プロンプトで詰まらなくなるが、危険操作も自動実行される点に注意
  const claudeCmd = process.env.CC_REMOTE_SKIP_PERMISSIONS === '1'
    ? 'claude --dangerously-skip-permissions\r'
    : 'claude\r';
  setTimeout(() => {
    try {
      ptyProcess.write(claudeCmd);
    } catch (err) {
      console.error(`[PTY] failed to send claude command [${id}]:`, err.message);
    }
  }, 800);

  saveSession(session);
  console.log(`[PTY] session created: ${id} (${name})`);
  return session;
}

// ---------------------------------------------------------------------------
// getSession / getAllSessions / deleteSession
// ---------------------------------------------------------------------------
export function getSession(id) {
  return sessions.get(id) || null;
}

export function getAllSessions() {
  return Array.from(sessions.values()).map(s => ({
    id: s.id,
    name: s.name,
    memo: s.memo,
    status: s.status,
    pinned: s.pinned || 0,
    archived: s.archived || 0,
    approvalLevel: s.approvalLevel || 'easy',
    tags: s.tags || '',
    createdAt: s.createdAt,
    outputHistory: s.outputHistory,
  }));
}

export function deleteSession(id) {
  const session = sessions.get(id);
  if (!session) return false;

  clearInterval(session.pollTimer);
  try { session.ptyProcess.kill(); } catch (_) { /* already dead */ }

  // Close SSE clients
  for (const res of session.sseClients) {
    try { res.end(); } catch (_) { /* ignore */ }
  }

  sessions.delete(id);

  // Remove from DB
  try {
    const db = getDB();
    db.run('DELETE FROM sessions WHERE id = ?', [id]);
    saveDB();
  } catch (err) {
    console.error(`[PTY] DB delete error [${id}]:`, err.message);
  }

  console.log(`[PTY] session deleted: ${id}`);
  return true;
}

// ---------------------------------------------------------------------------
// sendInput / sendKey
// ---------------------------------------------------------------------------
export function sendInput(id, text) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  if (!session.ptyProcess) throw new Error(`Session ${id} is not running`);
  // 入力サイズ制限（100KB）
  if (text.length > 100000) throw new Error('Input too large (max 100KB)');
  session.ptyProcess.write(text);
}

const KEY_MAP = {
  escape: '\x1b',
  'ctrl-c': '\x03',
  enter: '\r',
  tab: '\t',
  backspace: '\x7f',
  'ctrl-z': '\x1a',
  'ctrl-d': '\x04',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
};

export function sendKey(id, key) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  if (!session.ptyProcess) throw new Error(`Session ${id} is not running`);
  const seq = KEY_MAP[key.toLowerCase()];
  if (!seq) throw new Error(`Unknown key: ${key}`);
  session.ptyProcess.write(seq);
}

// ---------------------------------------------------------------------------
// getSessionStatus / renameSession / setSessionMemo
// ---------------------------------------------------------------------------
export function getSessionStatus(id) {
  const session = sessions.get(id);
  if (!session) return null;
  return session.status;
}

export function renameSession(id, newName) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  session.name = newName;
  saveSession(session);
  return session;
}

export function setSessionMemo(id, memo) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  session.memo = memo;
  saveSession(session);
  return session;
}

// ---------------------------------------------------------------------------
// List existing Claude Code sessions
// Reads ~/.claude/projects/<encoded-path>/<uuid>.jsonl files (current Claude Code layout)
// ---------------------------------------------------------------------------
export function listClaudeSessions() {
  const homeDir = os.homedir();
  const projectsDir = path.join(homeDir, '.claude', 'projects');
  const sessions = [];

  let projectDirs;
  try {
    projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }

  // Decode project dir name back to filesystem path
  // Format: "C--Users-lkoro-mylauje" -> "C:\Users\lkoro\mylauje" (best-effort)
  const decodeProjectDir = (encoded) => {
    // Leading "C--" means "C:\", subsequent "-" are path separators
    return encoded.replace(/^([A-Z])--/, '$1:\\').replace(/-/g, '\\');
  };

  for (const projectDir of projectDirs) {
    const fullDir = path.join(projectsDir, projectDir);
    let jsonlFiles;
    try {
      jsonlFiles = fs.readdirSync(fullDir)
        .filter(f => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const f of jsonlFiles) {
      const sessionId = f.replace(/\.jsonl$/, '');
      // Validate UUID format to prevent directory traversal via malformed filenames
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) continue;

      const filePath = path.join(fullDir, f);
      try {
        const stat = fs.statSync(filePath);
        // Skip empty files
        if (stat.size === 0) continue;

        // Read first line and last line for summary/timestamp
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length === 0) continue;

        let summary = '';
        let firstUserMessage = '';
        let cwd = '';
        let lastTimestamp = 0;

        // Scan for useful metadata
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.cwd && !cwd) cwd = entry.cwd;
            if (entry.summary && !summary) summary = entry.summary;
            if (entry.timestamp) {
              const ts = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : entry.timestamp;
              if (ts > lastTimestamp) lastTimestamp = ts;
            }
            // Grab first user message text for preview
            if (!firstUserMessage && entry.type === 'user' && entry.message) {
              const c = entry.message.content;
              if (typeof c === 'string') firstUserMessage = c;
              else if (Array.isArray(c)) {
                const text = c.find(x => x && x.type === 'text');
                if (text) firstUserMessage = text.text || '';
              }
            }
          } catch { /* skip malformed */ }
        }

        // Fall back to file mtime if no timestamp in content
        if (!lastTimestamp) lastTimestamp = stat.mtimeMs;

        const display = summary || firstUserMessage.slice(0, 80) || '(空のセッション)';
        const project = cwd || decodeProjectDir(projectDir);

        sessions.push({
          sessionId,
          project,
          display,
          timestamp: lastTimestamp,
          size: stat.size,
          messageCount: lines.length,
        });
      } catch { /* skip unreadable file */ }
    }
  }

  // Sort by timestamp desc, return recent 100
  return sessions
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);
}

// ---------------------------------------------------------------------------
// Resume existing Claude Code session via --resume
// Rev 5 REV5-001: projectCwd を受け取り、その project directory で claude を
// 起動することで `claude --resume <uuid>` が同じプロジェクトの history を
// 見つけられるようにする ("No conversation found" エラー対策)。
// ---------------------------------------------------------------------------
export async function resumeClaudeSession(claudeSessionId, name, projectCwd) {
  // Security: validate claudeSessionId to prevent command injection via PTY
  const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!claudeSessionId || !SESSION_ID_RE.test(claudeSessionId)) {
    throw new Error('無効なセッションIDフォーマットです');
  }
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(`セッション数上限(${MAX_SESSIONS})に達しています`);
  }

  // projectCwd が存在すればそれを使い、無ければ homedir にフォールバック。
  let effectiveCwd = os.homedir();
  if (projectCwd && typeof projectCwd === 'string') {
    try {
      if (fs.existsSync(projectCwd) && fs.statSync(projectCwd).isDirectory()) {
        effectiveCwd = projectCwd;
      } else {
        console.warn(`[PTY] resume: projectCwd "${projectCwd}" not found, falling back to homedir`);
      }
    } catch (err) {
      console.warn(`[PTY] resume: projectCwd check failed:`, err.message);
    }
  }

  const id = makeId();
  const screenBuf = new ScreenBuffer(220, 50);

  const ptyProcess = nodePty.spawn('cmd.exe', ['/k', 'chcp 65001 >nul'], {
    name: 'xterm-256color',
    cols: 220,
    rows: 50,
    cwd: effectiveCwd,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  const session = {
    id,
    name: name || `Resume: ${claudeSessionId.slice(0, 8)}`,
    memo: '',
    screenBuf,
    outputHistory: [],
    sseClients: [],
    scrollbackSentIndex: 0,
    lastCapture: '',
    ptyProcess,
    pollTimer: null,
    status: '起動中...',
    createdAt: Date.now(),
    autoApprove: true,
    approvalLevel: 'easy',
    claudeReady: false,
    claudeSessionId, // track original session ID
    contextUsage: 0, // 0-100 percent estimate
  };

  ptyProcess.onData(data => {
    screenBuf.write(data);
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.log(`[PTY] session [${id}] exited with code ${exitCode}`);
    session.status = 'exited';
    clearInterval(session.pollTimer);
    saveSession(session);
    broadcastSSE(session, 'status', { id, status: 'exited' });
  });

  sessions.set(id, session);
  startPoll(session);

  // Launch claude --resume after delay
  // 自走化対応: CC_REMOTE_SKIP_PERMISSIONS=1 で --dangerously-skip-permissions を付与
  const resumeFlags = process.env.CC_REMOTE_SKIP_PERMISSIONS === '1'
    ? '--dangerously-skip-permissions '
    : '';
  setTimeout(() => {
    try {
      ptyProcess.write(`claude ${resumeFlags}--resume ${claudeSessionId}\r`);
      // セッションピッカーでEnter確定（2秒後）
      setTimeout(() => {
        try { ptyProcess.write('\r'); } catch (_) {}
      }, 2000);
      // trust確認も通す（4秒後）
      setTimeout(() => {
        try { ptyProcess.write('\r'); } catch (_) {}
      }, 4000);
    } catch (err) {
      console.error(`[PTY] failed to resume claude [${id}]:`, err.message);
    }
  }, 800);

  saveSession(session);
  console.log(`[PTY] session resumed: ${id} (claude session: ${claudeSessionId})`);
  return session;
}

// ---------------------------------------------------------------------------
// DB persistence
// ---------------------------------------------------------------------------
export function saveSession(session) {
  try {
    const db = getDB();
    const now = Date.now();
    const params = [
      String(session.id),
      String(session.name || ''),
      String(session.memo || ''),
      String(session.status || 'running'),
      JSON.stringify((session.outputHistory || []).slice(-100)),
      '',
      Number(session.createdAt || now),
      Number(now),
    ];
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO sessions
        (id, name, memo, status, output_history, scrollback, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.bind(params);
    stmt.step();
    stmt.free();
    saveDB();
  } catch (err) {
    console.error(`[PTY] saveSession error [${session.id}]:`, err && err.message ? err.message : String(err));
  }
}

export function loadSessions() {
  try {
    const db = getDB();
    const stmt = db.prepare('SELECT * FROM sessions ORDER BY created_at ASC');
    const rows = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push(row);
    }
    stmt.free();

    for (const row of rows) {
      // Restore metadata only — no PTY restart
      const session = {
        id: row.id,
        name: row.name,
        memo: row.memo || '',
        screenBuf: new ScreenBuffer(220, 50),
        outputHistory: (() => { try { return JSON.parse(row.output_history || '[]'); } catch { return []; } })(),
        sseClients: [],
        scrollbackSentIndex: 0,
        lastCapture: '',
        ptyProcess: null,
        pollTimer: null,
        status: 'exited',
        createdAt: row.created_at,
      };
      sessions.set(session.id, session);
    }

    console.log(`[PTY] loadSessions: ${rows.length} sessions restored from DB`);
  } catch (err) {
    console.error('[PTY] loadSessions error:', err.message);
  }
}
