// Rev 6: スケジュール機能 (旧タスクキュー置換)
//   - kind='once'  : trigger_at は ISO datetime 文字列 (local TZ)
//   - kind='daily' : trigger_at は 'HH:MM'
//   - next_run (ms) を計算 → 20 秒間隔の runner が到来したスケジュールを PTY へ送信
import express from 'express';
import { getDB, saveDB } from './db.js';
import { sendInput } from './pty-manager.js';

const LOG = '[Schedule]';

export const scheduleRoutes = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function rowsFromExec(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function computeNextRun(kind, triggerAt, from = Date.now()) {
  if (kind === 'once') {
    const t = new Date(triggerAt).getTime();
    return isNaN(t) ? 0 : t;
  }
  if (kind === 'daily') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(triggerAt || ''));
    if (!m) return 0;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return 0;
    const d = new Date(from);
    d.setSeconds(0); d.setMilliseconds(0);
    d.setHours(h, min, 0, 0);
    if (d.getTime() <= from) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  return 0;
}

// ---------------------------------------------------------------------------
// CRUD routes
// ---------------------------------------------------------------------------
scheduleRoutes.get('/', (req, res) => {
  try {
    const db = getDB();
    const result = db.exec('SELECT * FROM schedules ORDER BY next_run ASC');
    res.json({ schedules: rowsFromExec(result) });
  } catch (e) {
    console.error(LOG, 'list error', e.message);
    res.status(500).json({ error: e.message });
  }
});

scheduleRoutes.post('/', (req, res) => {
  try {
    const { title, prompt, sessionId, kind, triggerAt } = req.body || {};
    if (!title || !prompt || !kind || !triggerAt) {
      return res.status(400).json({ error: 'title, prompt, kind, triggerAt required' });
    }
    if (!['once', 'daily'].includes(kind)) {
      return res.status(400).json({ error: 'kind must be once or daily' });
    }
    const nextRun = computeNextRun(kind, triggerAt);
    if (!nextRun) return res.status(400).json({ error: 'invalid triggerAt' });
    const db = getDB();
    db.run(
      `INSERT INTO schedules (title, prompt, session_id, kind, trigger_at, next_run, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [title, prompt, sessionId || '', kind, String(triggerAt), nextRun, Date.now()]
    );
    saveDB();
    res.json({ ok: true });
  } catch (e) {
    console.error(LOG, 'create error', e.message);
    res.status(500).json({ error: e.message });
  }
});

scheduleRoutes.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const db = getDB();
    db.run('DELETE FROM schedules WHERE id = ?', [id]);
    saveDB();
    res.json({ ok: true });
  } catch (e) {
    console.error(LOG, 'delete error', e.message);
    res.status(500).json({ error: e.message });
  }
});

scheduleRoutes.patch('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const { status } = req.body || {};
    if (!['pending', 'disabled'].includes(status)) {
      return res.status(400).json({ error: 'status must be pending or disabled' });
    }
    const db = getDB();
    db.run('UPDATE schedules SET status = ? WHERE id = ?', [status, id]);
    saveDB();
    res.json({ ok: true });
  } catch (e) {
    console.error(LOG, 'patch error', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Runner — 20 秒間隔で到来したスケジュールを実行
// ---------------------------------------------------------------------------
let runnerTimer = null;

function tick() {
  try {
    const db = getDB();
    const now = Date.now();
    const result = db.exec(
      'SELECT * FROM schedules WHERE status = "pending" AND next_run > 0 AND next_run <= ?',
      [now]
    );
    const due = rowsFromExec(result);
    if (due.length === 0) return;

    for (const s of due) {
      try {
        if (s.session_id) {
          sendInput(s.session_id, s.prompt + '\r');
        } else {
          console.warn(LOG, 'skipped (no session_id)', s.id, s.title);
        }
        if (s.kind === 'daily') {
          const next = computeNextRun('daily', s.trigger_at, now + 60 * 1000);
          db.run(
            'UPDATE schedules SET last_run = ?, next_run = ?, last_error = "" WHERE id = ?',
            [now, next, s.id]
          );
        } else {
          db.run(
            'UPDATE schedules SET last_run = ?, status = "done", last_error = "" WHERE id = ?',
            [now, s.id]
          );
        }
        console.log(LOG, 'executed', s.id, s.title);
      } catch (e) {
        db.run('UPDATE schedules SET last_error = ? WHERE id = ?', [String(e.message || e), s.id]);
        console.error(LOG, 'execute error', s.id, e.message);
      }
    }
    saveDB();
  } catch (e) {
    console.error(LOG, 'tick error', e.message);
  }
}

export function startScheduleRunner() {
  if (runnerTimer) return;
  runnerTimer = setInterval(tick, 20 * 1000);
  console.log(LOG, 'runner started (20s interval)');
  setTimeout(tick, 2000);
}
