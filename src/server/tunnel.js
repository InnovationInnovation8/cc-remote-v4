// Cloudflare Tunnel integration
import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

let tunnelProcess = null;
let tunnelStartedAt = null;
// 静音死対策: restartTunnel 経路と exit ハンドラ経路の二重起動を防ぐフラグ
let _restartScheduled = false;

// 自走化対応: URL変化時のコールバック（スリープ復帰/トンネル再接続で新URLが来た時に即反映）
let _onUrlChangeCallback = null;
export function onTunnelUrlChange(cb) {
  _onUrlChangeCallback = typeof cb === 'function' ? cb : null;
}
function _notifyUrlChange(newUrl) {
  if (_onUrlChangeCallback && newUrl) {
    try {
      _onUrlChangeCallback(newUrl);
    } catch (e) {
      console.log(`[Tunnel] onUrlChange callback error: ${e.message}`);
    }
  }
}

export function startTunnel(port = 3737) {
  // 静音死対策: 先頭でフラグリセット + 起動時刻記録
  _restartScheduled = false;
  tunnelStartedAt = Date.now();

  // cloudflaredのパスを探す
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const wingetBase = path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');

  // WinGetパッケージからcloudflaredを探す
  let wingetPath = null;
  try {
    const pkgs = fs.readdirSync(wingetBase);
    const cfPkg = pkgs.find(p => p.startsWith('Cloudflare.cloudflared'));
    if (cfPkg) wingetPath = path.join(wingetBase, cfPkg, 'cloudflared.exe');
  } catch {}

  const possiblePaths = [
    wingetPath,
    path.join(process.cwd(), 'cloudflared.exe'),
    'cloudflared',
  ].filter(Boolean);

  let cloudflaredPath = null;
  for (const p of possiblePaths) {
    try {
      execSync(`"${p}" --version`, { stdio: 'ignore' });
      cloudflaredPath = p;
      break;
    } catch (e) {}
  }

  if (!cloudflaredPath) {
    console.log('[Tunnel] cloudflaredが見つかりません。トンネルなしで起動。');
    return null;
  }

  const tunnelName = process.env.TUNNEL_NAME;
  const tunnelHostname = process.env.TUNNEL_HOSTNAME;

  if (tunnelName) {
    // 名前付きトンネル（固定ドメイン）
    return new Promise((resolve) => {
      console.log(`[Tunnel] 名前付きトンネルで起動: ${tunnelName}`);
      tunnelProcess = spawn(cloudflaredPath, [
        'tunnel', 'run', tunnelName
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      const url = tunnelHostname || null;
      global.tunnelUrl = url;
      if (url) {
        console.log(`[Tunnel] URL: ${url}`);
      } else {
        console.log('[Tunnel] TUNNEL_HOSTNAMEが未設定。URLは不明のまま起動。');
      }

      tunnelProcess.stdout.on('data', (data) => {
        process.stdout.write(`[Tunnel] ${data}`);
      });
      tunnelProcess.stderr.on('data', (data) => {
        process.stderr.write(`[Tunnel] ${data}`);
      });

      tunnelProcess.on('exit', (code) => {
        console.log(`[Tunnel] プロセス終了 code: ${code}`);
        const wasScheduled = _restartScheduled;
        tunnelProcess = null;
        global.tunnelUrl = null;
        if (wasScheduled) {
          // restartTunnel 経路が再接続を担当しているので何もしない
          return;
        }
        _restartScheduled = true;
        // 自動再接続（5秒後）
        setTimeout(() => {
          console.log('[Tunnel] 再接続中...');
          startTunnel(port);
        }, 5000);
      });

      resolve(url);
    });
  }

  // Quick Tunnel（ランダムURL）
  return new Promise((resolve) => {
    tunnelProcess = spawn(cloudflaredPath, [
      'tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let resolved = false;

    const handleOutput = (data) => {
      const text = data.toString();
      // URLを検出
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        const newUrl = match[0];
        const changed = global.tunnelUrl !== newUrl;
        if (!resolved) {
          resolved = true;
          global.tunnelUrl = newUrl;
          console.log(`[Tunnel] URL: ${newUrl}`);
          resolve(newUrl);
        } else if (changed) {
          // 自走化対応: 再接続後に新URLが検出されたら即時通知
          global.tunnelUrl = newUrl;
          console.log(`[Tunnel] URL changed (reconnect): ${newUrl}`);
          _notifyUrlChange(newUrl);
        }
      }
    };

    tunnelProcess.stdout.on('data', handleOutput);
    tunnelProcess.stderr.on('data', handleOutput);

    tunnelProcess.on('exit', (code) => {
      console.log(`[Tunnel] プロセス終了 code: ${code}`);
      const wasScheduled = _restartScheduled;
      tunnelProcess = null;
      global.tunnelUrl = null;
      if (wasScheduled) {
        // restartTunnel 経路が再接続を担当しているので何もしない
        return;
      }
      _restartScheduled = true;
      // 自動再接続（5秒後）
      setTimeout(() => {
        console.log('[Tunnel] 再接続中...');
        startTunnel(port);
      }, 5000);
    });

    // 10秒以内にURL取れなかったらタイムアウト
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log('[Tunnel] URL取得タイムアウト');
        resolve(null);
      }
    }, 10000);
  });
}

export function stopTunnel() {
  if (tunnelProcess) {
    tunnelProcess.kill();
    tunnelProcess = null;
    global.tunnelUrl = null;
  }
}

export function getTunnelUrl() {
  return global.tunnelUrl || null;
}

// --- 静音死対策 API（watchdog.js から使用） ---

export function isTunnelAlive() {
  if (!tunnelProcess?.pid) return false;
  try {
    // シグナル 0 はシグナル送信せず存在確認のみ。Windows では ESRCH/EPERM 等 OS により異なるエラーを投げるので catch-all で判定
    process.kill(tunnelProcess.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isTunnelRestarting() {
  return _restartScheduled;
}

export function getTunnelStartedAt() {
  return tunnelStartedAt;
}

export async function restartTunnel(port = 3737) {
  // 順序厳守: フラグを最優先でセットして exit ハンドラの二重再起動を抑制
  _restartScheduled = true;
  stopTunnel();
  // 既存の exit ハンドラ経路と同等の 5 秒待機
  await new Promise((r) => setTimeout(r, 5000));
  return startTunnel(port);
}
