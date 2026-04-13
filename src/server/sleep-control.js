// Sleep Control - PC sleep prevention (ported from v2.0)
import { execSync } from 'child_process';

let sleepDisabled = false;

export function disableSleep() {
  if (sleepDisabled) return;
  try {
    execSync('powercfg /change standby-timeout-ac 0', { stdio: 'ignore' });
    execSync('powercfg /change standby-timeout-dc 0', { stdio: 'ignore' });
    sleepDisabled = true;
    console.log('[Sleep] スリープ抑制ON');
  } catch (e) {
    console.error('[Sleep] スリープ抑制失敗:', e.message);
  }
}

export function restoreSleep() {
  if (!sleepDisabled) return;
  try {
    execSync('powercfg /change standby-timeout-ac 10', { stdio: 'ignore' });
    execSync('powercfg /change standby-timeout-dc 3', { stdio: 'ignore' });
    sleepDisabled = false;
    console.log('[Sleep] スリープ復元');
  } catch (e) {
    console.error('[Sleep] スリープ復元失敗:', e.message);
  }
}

export function isSleepDisabled() {
  return sleepDisabled;
}

export function initSleepControl() {
  // サーバー終了時にスリープ設定を復元
  process.on('exit', restoreSleep);
  process.on('SIGINT', () => { restoreSleep(); process.exit(); });
  process.on('SIGTERM', () => { restoreSleep(); process.exit(); });
  console.log('[Sleep] スリープ制御初期化完了');
}
