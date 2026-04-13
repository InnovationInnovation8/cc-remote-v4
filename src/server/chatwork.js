// Chatwork notification module
// Rev 5: PC Agent からタスク完了 / エラー / ストール時に Chatwork に通知を送る。
// 設定は settings テーブルに保存 (token, room_id, enabled, events)
import https from 'https';
import { Router } from 'express';
import { getDB, saveDB } from './db.js';

const chatworkRoutes = Router();

const SETTING_KEYS = {
  token: 'chatwork_token',
  roomId: 'chatwork_room_id',
  enabled: 'chatwork_enabled',
  events: 'chatwork_events',
};

const DEFAULT_EVENTS = ['task_complete', 'task_error', 'stall'];

function readSetting(key, fallback = '') {
  try {
    const db = getDB();
    const result = db.exec(`SELECT value FROM settings WHERE key = '${key}'`);
    if (!result.length || !result[0].values.length) return fallback;
    return result[0].values[0][0];
  } catch (err) {
    console.warn('[Chatwork] settings read error:', err.message);
    return fallback;
  }
}

function writeSetting(key, value) {
  const db = getDB();
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
  saveDB();
}

export function getChatworkConfig() {
  const token = readSetting(SETTING_KEYS.token, '');
  const roomId = readSetting(SETTING_KEYS.roomId, '');
  const enabledRaw = readSetting(SETTING_KEYS.enabled, '0');
  const eventsRaw = readSetting(SETTING_KEYS.events, JSON.stringify(DEFAULT_EVENTS));
  let events;
  try {
    events = JSON.parse(eventsRaw);
    if (!Array.isArray(events)) events = DEFAULT_EVENTS;
  } catch {
    events = DEFAULT_EVENTS;
  }
  return {
    token,
    roomId,
    enabled: enabledRaw === '1' || enabledRaw === 'true',
    events,
  };
}

export function isEventEnabled(eventType) {
  const cfg = getChatworkConfig();
  if (!cfg.enabled) return false;
  if (!cfg.token || !cfg.roomId) return false;
  return cfg.events.includes(eventType);
}

// Chatwork API に POST /rooms/{room_id}/messages
// body: body=<URL encoded message>
export function postToChatwork(message, cfgOverride = null) {
  return new Promise((resolve, reject) => {
    const cfg = cfgOverride || getChatworkConfig();
    if (!cfg.token || !cfg.roomId) {
      reject(new Error('Chatwork token or room_id not configured'));
      return;
    }
    const body = `body=${encodeURIComponent(message)}`;
    const options = {
      hostname: 'api.chatwork.com',
      port: 443,
      path: `/v2/rooms/${encodeURIComponent(cfg.roomId)}/messages`,
      method: 'POST',
      headers: {
        'X-ChatWorkToken': cfg.token,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    };
    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', (d) => { chunks += d.toString(); });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: res.statusCode, body: chunks });
        } else {
          reject(new Error(`Chatwork API ${res.statusCode}: ${chunks}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Chatwork API timeout')); });
    req.write(body);
    req.end();
  });
}

// イベント送信 (config.events フィルタあり)
export async function notifyEvent(eventType, message) {
  try {
    if (!isEventEnabled(eventType)) return;
    await postToChatwork(`[info][title]CC Remote[/title]${message}[/info]`);
    console.log(`[Chatwork] sent ${eventType}: ${message.slice(0, 40)}...`);
  } catch (err) {
    console.warn('[Chatwork] notify failed:', err.message);
  }
}

// ---- Routes ----

// GET /api/chatwork/config
chatworkRoutes.get('/config', (req, res) => {
  const cfg = getChatworkConfig();
  // token は先頭4文字だけ返す (セキュリティ)
  res.json({
    tokenPreview: cfg.token ? cfg.token.slice(0, 4) + '…' : '',
    hasToken: !!cfg.token,
    roomId: cfg.roomId,
    enabled: cfg.enabled,
    events: cfg.events,
  });
});

// POST /api/chatwork/config
chatworkRoutes.post('/config', (req, res) => {
  const { token, roomId, enabled, events } = req.body || {};
  try {
    if (typeof token === 'string' && token.length > 0) writeSetting(SETTING_KEYS.token, token);
    if (typeof roomId === 'string') writeSetting(SETTING_KEYS.roomId, roomId);
    if (typeof enabled === 'boolean') writeSetting(SETTING_KEYS.enabled, enabled ? '1' : '0');
    if (Array.isArray(events)) writeSetting(SETTING_KEYS.events, JSON.stringify(events));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chatwork/test - テスト送信
chatworkRoutes.post('/test', async (req, res) => {
  try {
    await postToChatwork('[info][title]CC Remote テスト通知[/title]Chatwork 連携が動作しています。[/info]');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export { chatworkRoutes };
