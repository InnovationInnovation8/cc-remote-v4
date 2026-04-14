// Watchdog - Session monitoring and auto-recovery
import { getAllSessions, getSession, resumeClaudeSession, createSession } from './pty-manager.js';
import { sendNotification } from './notifications.js';
import {
  isTunnelAlive,
  isTunnelRestarting,
  getTunnelStartedAt,
  restartTunnel,
} from './tunnel.js';

let watchdogTimer = null;

// 自走化対応: 自動再起動の試行回数（無限ループ防止）
const _restartAttempts = new Map(); // sessionId -> { count, lastAttemptAt }
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_COOLDOWN_MS = 5 * 60 * 1000; // 5 min

// --- 静音死対策: tunnel 死活監視 ---
const MAX_TUNNEL_RESTART_ATTEMPTS = 3;
const TUNNEL_RESTART_COOLDOWN_MS = 5 * 60 * 1000; // 5 min
const TUNNEL_STARTUP_GRACE_MS = 30 * 1000;        // 30 sec
const TUNNEL_SELFPING_INTERVAL_MS = 2 * 60 * 1000;  // 2 min (was 10)
const TUNNEL_SELFPING_FAIL_THRESHOLD = 2;            // 2 (was 3) — max detect 5min
const TUNNEL_SELFPING_TIMEOUT_MS = 5000;

const _tunnelRestart = { count: 0, lastAttemptAt: 0 };
let _lastPingAt = 0;
let _pingFailStreak = 0;

export function initWatchdog(port = 3737) {
  watchdogTimer = setInterval(() => {
    checkSessions().catch((e) => console.log(`[Watchdog] checkSessions error: ${e.message}`));
    checkTunnel(port).catch((e) => console.log(`[Watchdog][Tunnel] checkTunnel error: ${e.message}`));
  }, 30000);
  console.log('[Watchdog] 監視開始（30秒間隔）');
  if (process.env.CC_REMOTE_AUTO_RESTART === '1') {
    console.log('[Watchdog] 自動再起動モード有効（CC_REMOTE_AUTO_RESTART=1）');
  }
  if (process.env.CC_REMOTE_TUNNEL_SELFPING === '0') {
    console.log('[Watchdog][Tunnel] self-ping 無効化（CC_REMOTE_TUNNEL_SELFPING=0）');
  } else {
    console.log(`[Watchdog][Tunnel] self-ping 有効（${TUNNEL_SELFPING_INTERVAL_MS/60000}分間隔、連続${TUNNEL_SELFPING_FAIL_THRESHOLD}回失敗で再起動、localhost経由）`);
  }
}

async function tryAutoRestart(live) {
  const sessionId = live.id;
  const now = Date.now();
  const entry = _restartAttempts.get(sessionId) || { count: 0, lastAttemptAt: 0 };

  // クールダウン中はスキップ
  if (now - entry.lastAttemptAt < RESTART_COOLDOWN_MS && entry.count >= MAX_RESTART_ATTEMPTS) {
    return false;
  }
  // クールダウン経過でカウントリセット
  if (now - entry.lastAttemptAt >= RESTART_COOLDOWN_MS) {
    entry.count = 0;
  }
  if (entry.count >= MAX_RESTART_ATTEMPTS) {
    console.log(`[Watchdog] ${sessionId} 再起動上限到達、諦めます`);
    return false;
  }

  entry.count++;
  entry.lastAttemptAt = now;
  _restartAttempts.set(sessionId, entry);

  try {
    if (live.claudeSessionId) {
      // Claudeセッション継続（resume）
      console.log(`[Watchdog] ${sessionId} を resume で自動再起動（試行 ${entry.count}/${MAX_RESTART_ATTEMPTS}）`);
      await resumeClaudeSession(live.claudeSessionId, live.name, live.projectCwd);
    } else {
      // 新規セッション（元の内容は失われる）
      console.log(`[Watchdog] ${sessionId} を新規 create で自動再起動（試行 ${entry.count}/${MAX_RESTART_ATTEMPTS}）`);
      await createSession(live.name);
    }
    return true;
  } catch (e) {
    console.log(`[Watchdog] 自動再起動失敗 ${sessionId}: ${e.message}`);
    return false;
  }
}

async function checkSessions() {
  const sessions = getAllSessions();
  for (const s of sessions) {
    // getSession returns the live session object with ptyProcess
    const live = getSession(s.id);
    if (!live) continue;

    if (live.status === 'running' && !live.ptyProcess) {
      console.log(`[Watchdog] セッション ${live.id} (${live.name}) のPTY停止を検知`);
      live.status = 'stopped';

      // 自走化対応: CC_REMOTE_AUTO_RESTART=1 で自動再起動
      const autoRestart = process.env.CC_REMOTE_AUTO_RESTART === '1';
      if (autoRestart) {
        const restarted = await tryAutoRestart(live);
        if (restarted) {
          sendNotification(
            'セッション自動再起動',
            `${live.name} を自動再起動しました`
          ).catch(() => {});
          continue;
        }
      }

      sendNotification(
        'セッション停止',
        `${live.name} が停止しました。再起動してください。`
      ).catch(() => {});
    }
  }
}

// --- 静音死対策: tunnel 死活監視 ---
async function checkTunnel(port) {
  // 再起動進行中なら触らない（exit ハンドラ経路 or restartTunnel が仕事中）
  if (isTunnelRestarting()) return;
  const startedAt = getTunnelStartedAt();
  if (!startedAt) return; // 未起動。判定対象外

  // --- A) プロセス消滅検知 ---
  if (!isTunnelAlive()) {
    const now = Date.now();
    // 起動直後 grace
    if (now - startedAt < TUNNEL_STARTUP_GRACE_MS) {
      console.log('[Watchdog][Tunnel] 起動直後 grace により判定スキップ');
      return;
    }

    // クールダウン経過でカウントリセット
    if (now - _tunnelRestart.lastAttemptAt >= TUNNEL_RESTART_COOLDOWN_MS) {
      _tunnelRestart.count = 0;
    }
    if (_tunnelRestart.count >= MAX_TUNNEL_RESTART_ATTEMPTS) {
      console.log('[Watchdog][Tunnel] 再起動上限到達、諦めます（クールダウン後にリセット）');
      sendNotification(
        'Tunnel 再起動上限',
        `cloudflared の再起動が ${MAX_TUNNEL_RESTART_ATTEMPTS} 回連続失敗しました。手動対応が必要です。`
      ).catch(() => {});
      return;
    }

    _tunnelRestart.count++;
    _tunnelRestart.lastAttemptAt = now;
    console.log(`[Watchdog][Tunnel] プロセス静音死検知、再起動します（試行 ${_tunnelRestart.count}/${MAX_TUNNEL_RESTART_ATTEMPTS}）`);

    try {
      const result = await restartTunnel(port);
      // restartTunnel の戻り値が null = cloudflared 見つからず
      if (result === null) {
        console.log('[Watchdog][Tunnel] cloudflared 起動失敗、次 tick でリトライ');
        sendNotification(
          'Tunnel 起動失敗',
          'cloudflared が見つからず tunnel を復旧できませんでした。'
        ).catch(() => {});
      } else {
        sendNotification(
          'Tunnel 自動再起動',
          'cloudflared が落ちていたため再起動しました'
        ).catch(() => {});
        // プロセス消滅経路で再起動した場合は self-ping カウンタをリセット
        _pingFailStreak = 0;
      }
    } catch (e) {
      console.log(`[Watchdog][Tunnel] restartTunnel エラー: ${e.message}`);
    }
    return; // 同じ tick で self-ping しない
  }

  // --- B) self-ping（デフォルト有効、opt-out = CC_REMOTE_TUNNEL_SELFPING=0） ---
  if (process.env.CC_REMOTE_TUNNEL_SELFPING === '0') return;
  if (!global.tunnelUrl) return;

  const now = Date.now();
  if (now - _lastPingAt < TUNNEL_SELFPING_INTERVAL_MS) return;
  _lastPingAt = now;

  try {
    // Step 1.5: self-ping via localhost to avoid DNS propagation false-positives
    const res = await fetch('http://localhost:' + port + '/api/ping', {
      method: 'HEAD',
      signal: AbortSignal.timeout(TUNNEL_SELFPING_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    _pingFailStreak = 0;
  } catch (e) {
    _pingFailStreak++;
    console.log(`[Watchdog][Tunnel] self-ping 失敗 ${_pingFailStreak}/${TUNNEL_SELFPING_FAIL_THRESHOLD}: ${e.message}`);
    if (_pingFailStreak >= TUNNEL_SELFPING_FAIL_THRESHOLD) {
      // R2-5: self-ping 経路も再起動上限カウンターに連動（無限再起動防止）
      const now = Date.now();
      if (now - _tunnelRestart.lastAttemptAt >= TUNNEL_RESTART_COOLDOWN_MS) {
        _tunnelRestart.count = 0;
      }
      if (_tunnelRestart.count >= MAX_TUNNEL_RESTART_ATTEMPTS) {
        console.log('[Watchdog][Tunnel] self-ping 経路: 再起動上限到達、諦めます');
        sendNotification(
          'Tunnel 再起動上限',
          'self-ping 経路で再起動が連続失敗しました。手動対応が必要です。'
        ).catch(() => {});
        _pingFailStreak = 0;
        return;
      }
      _tunnelRestart.count++;
      _tunnelRestart.lastAttemptAt = now;
      console.log(`[Watchdog][Tunnel] ローカルAPI到達不能、tunnel再起動（self-ping 試行 ${_tunnelRestart.count}/${MAX_TUNNEL_RESTART_ATTEMPTS}）`);
      _pingFailStreak = 0;
      try {
        await restartTunnel(port);
        sendNotification(
          'Tunnel 自動再起動',
          'ローカル /api/ping が連続失敗したため tunnel を再起動しました'
        ).catch(() => {});
      } catch (err) {
        console.log(`[Watchdog][Tunnel] restartTunnel (self-ping 経路) エラー: ${err.message}`);
      }
    }
  }
}

export function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}
