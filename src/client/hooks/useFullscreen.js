// CC-Remote v2 UI — useFullscreen
// App.jsx inline の fullscreen 切替ロジックを Phase 3 Step 3-1 で hook 化。
// - document.fullscreenEnabled が真 → ネイティブ requestFullscreen / exitFullscreen
// - iOS Safari など非対応 → document.getElementById('root') に position:fixed;inset:0 で擬似全画面
//   （MUST-B2: document.body は NG。root で行う）
// - iOS ヒント: `ccr-fullscreen-hint-shown` IDB フラグが未立ちなら入る瞬間に 1 回だけ alert 表示
// - fullscreenchange イベントで外部解除（ESC 等）にも追従
import { useCallback, useEffect, useState } from 'react';
import { idbGet, idbSet } from '../utils/idbStore';

function isIOSLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua);
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const applyIosFallback = useCallback((enable) => {
    const root = document.getElementById('root');
    if (!root) return;
    if (enable) {
      root.style.position = 'fixed';
      root.style.inset = '0';
      root.style.zIndex = '9999';
    } else {
      root.style.position = '';
      root.style.inset = '';
      root.style.zIndex = '';
    }
  }, []);

  const toggle = useCallback(async () => {
    const nativeEnabled = typeof document !== 'undefined' && document.fullscreenEnabled;

    if (!nativeEnabled) {
      // iOS フォールバック系
      if (!isFullscreen) {
        applyIosFallback(true);
        setIsFullscreen(true);
        if (isIOSLike()) {
          const shown = await idbGet('ccr-fullscreen-hint-shown', false);
          if (!shown) {
            try {
              alert('全画面にするには PWA インストールをご利用ください');
            } catch {}
            idbSet('ccr-fullscreen-hint-shown', true);
          }
        }
      } else {
        applyIosFallback(false);
        setIsFullscreen(false);
      }
      return;
    }

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // ユーザーが requestFullscreen を拒否した等の場合は無視
    }
  }, [isFullscreen, applyIosFallback]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  return { isFullscreen, toggle };
}
