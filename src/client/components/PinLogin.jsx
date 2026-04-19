// CC-Remote v4 — PinLogin (4-digit screen lock PIN, Google OAuth gates PC registration)
import { useState, useEffect, useRef } from 'react';
import { soundSessionStart, soundError } from '../utils/sounds';
import {
  setToken,
  getApiBase,
  getGoogleSession,
  setGoogleSession,
  clearGoogleSession,
  setActivePcLabel,
} from '../utils/api';
import { track } from '../utils/analytics';

const PIN_MIN = 4;
const PIN_MAX = 4;
const GOOGLE_CLIENT_ID = '963785499726-v0da2q3hqktflate717q7033snjcht90.apps.googleusercontent.com';

function PinDots({ pin }) {
  // Show up to PIN_MIN dots; if pin > PIN_MIN, expand
  const total = Math.max(PIN_MIN, pin.length);
  return (
    <div className="pet-frame p-4 mb-5">
      <div className="flex flex-wrap justify-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`w-9 h-9 rounded border-2 flex items-center justify-center text-base font-mono transition-all duration-200
              ${pin.length > i
                ? 'border-navi-glow bg-navi-glow/10 text-navi-glow shadow-neon-cyan'
                : 'border-cyber-500 bg-cyber-800 text-txt-muted'}`}
          >
            {pin.length > i ? '\u25C6' : '\u25C7'}
          </div>
        ))}
      </div>
    </div>
  );
}

function Numpad({ onNumpad }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 mb-4">
      {[1,2,3,4,5,6,7,8,9,'clear',0,'del'].map((num, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onNumpad(num === 'del' ? 'del' : num === 'clear' ? 'clear' : String(num))}
          className="h-12 rounded text-base font-mono transition-all duration-150 chip-btn active:shadow-neon-cyan active:border-navi-glow"
        >
          {num === 'del' ? 'DEL' : num === 'clear' ? 'CLR' : num}
        </button>
      ))}
    </div>
  );
}

export default function PinLogin({ onLogin }) {
  const [hasPin, setHasPin] = useState(null);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [jackIn, setJackIn] = useState(false);
  // 段階1+2: Google session は IDB (api.js) に永続化。React state はキャッシュとして利用。
  const [googleSession, setGoogleSessionState] = useState('');
  const [trustedDeviceMode, setTrustedDeviceMode] = useState(true);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);
  const [pcLabel, setPcLabel] = useState('');
  const googleBtnRef = useRef(null);

  // 段階1+2: 起動時に IDB から既存の Google session を取り出し、
  //   サーバーに「session 生きてる？信頼端末モードON？」と問い合わせる。
  //   → 両方YESなら /auth/auto-login で token を発行してもらい PIN画面を完全スキップ。
  //   失敗時は従来通り Google ログイン → PIN の流れに自動フォールバック。
  // 2026-04-17: 旧「PC接続URLを入力」画面（needsRemoteBase）を削除。
  //   dispatcher mode では App.jsx の handleSelectPC が remoteBase 先置き → activePC で
  //   rerender する順序に修正済み。PC tunnel 直アクセス時は相対 `/api` で動く。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = getApiBase();
      const savedSession = await getGoogleSession();
      try {
        const url = savedSession
          ? `${base}/auth/status?session=${encodeURIComponent(savedSession)}`
          : `${base}/auth/status`;
        const r = await fetch(url);
        const data = r.ok ? await r.json() : { hasPin: false };
        if (cancelled) return;
        setHasPin(!!data.hasPin);
        setTrustedDeviceMode(data.trustedDeviceMode === true); // default false（PIN 1時間方針）
        setPcLabel(data.pcLabel || '');
        // 2026-04-17: token / google session の IDB キーを pcLabel ベースに切替。
        // これでサーバー再起動でトンネルURLが変わっても同じ PC なら token を引き継げる。
        if (data.pcLabel) setActivePcLabel(data.pcLabel);

        // 案1 の link-ticket は App.jsx handleSelectPC 側でシームレス消費するため、
        // ここには到達しない（成功時は PinLogin 自体がマウントされない）。
        // 失敗時は以下の Google session auto-login / Google OAuth フローに流れる。

        // 復元した session がサーバー側でも生きていれば React state に反映
        if (savedSession && data.googleSessionValid) {
          setGoogleSessionState(savedSession);

          // 信頼端末モードONなら PIN すらスキップして自動ログイン
          if (data.trustedDeviceMode !== false) {
            try {
              const autoRes = await fetch(`${base}/auth/auto-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session: savedSession }),
              });
              if (autoRes.ok) {
                const autoData = await autoRes.json();
                if (autoData.token && !cancelled) {
                  setToken(autoData.token);
                  try { soundSessionStart(); } catch {}
                  setJackIn(true);
                  track('login_auto_success');
                  setTimeout(() => onLogin?.(), 800);
                  setAutoLoginAttempted(true);
                  return;
                }
              }
            } catch (e) {
              // ネットワーク失敗等。手動フローへフォールバック
            }
          }
        } else if (savedSession && !data.googleSessionValid) {
          // サーバー側で期限切れ / 不明なら IDB の session も掃除
          await clearGoogleSession();
          setGoogleSessionState('');
        }
      } catch {
        if (!cancelled) setHasPin(false);
      } finally {
        if (!cancelled) setAutoLoginAttempted(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Initialize Google Identity Services when no session yet.
  // 段階1: auto_select + prompt() で「ログイン済み Google アカウントを無音で credential 化」する。
  // 段階2: callback 内で trustedDeviceMode の token を受けたら PIN 画面をスキップして即ログイン。
  useEffect(() => {
    if (googleSession) return;
    if (!autoLoginAttempted) return; // 自動ログインの試行が終わるまで GIS は初期化しない
    let cancelled = false;
    const tryInit = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id || !googleBtnRef.current) {
        setTimeout(tryInit, 200);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        auto_select: true,
        cancel_on_tap_outside: false,
        use_fedcm_for_prompt: true,
        callback: async (response) => {
          try {
            const base = getApiBase();
            const res = await fetch(`${base}/auth/google`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: response.credential }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || 'Google認証に失敗しました');
            }
            const data = await res.json();
            // 段階1: session を IDB に永続化（host 別キー）— ブラウザ再起動を超えて持ち越せる
            await setGoogleSession(data.session);
            setGoogleSessionState(data.session);
            setError('');
            track('login_google_success');

            // 段階2: trustedDeviceMode + token が返ってきたら PIN スキップ
            if (data.trustedDeviceMode && data.token) {
              setToken(data.token);
              try { soundSessionStart(); } catch {}
              setJackIn(true);
              track('login_auto_success');
              setTimeout(() => onLogin?.(), 800);
            }
          } catch (err) {
            setError(err.message);
            track('login_google_failed', { reason: err.message });
            try { soundError(); } catch {}
          }
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        locale: 'ja',
        width: 260,
      });
      // 段階1: One Tap を立ち上げて「Google にログイン中なら無音で credential 取得」
      try {
        window.google.accounts.id.prompt();
      } catch {}
    };
    tryInit();
    return () => { cancelled = true; };
  }, [googleSession, autoLoginAttempted]);

  // Auto-submit PIN when fully entered
  useEffect(() => {
    if (!googleSession) return;
    if (pin.length !== PIN_MAX) return;
    if (loading) return;
    const ev = { preventDefault: () => {} };
    handleSubmit(ev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const isSetup = hasPin === false;

  const handleNumpad = (key) => {
    if (key === 'del') setPin(prev => prev.slice(0, -1));
    else if (key === 'clear') setPin('');
    else if (pin.length < PIN_MAX) setPin(prev => prev + key);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pin.length < PIN_MIN) {
      setError(`PINは${PIN_MIN}桁で入力してください`);
      return;
    }
    if (isSetup && !isConfirming) {
      setPinConfirm(pin);
      setPin('');
      setIsConfirming(true);
      setError('');
      return;
    }
    if (isSetup && isConfirming) {
      if (pin !== pinConfirm) {
        setError('PINが一致しません');
        setPin('');
        setPinConfirm('');
        setIsConfirming(false);
        try { soundError(); } catch {}
        return;
      }
    }
    setLoading(true);
    setError('');
    try {
      const base = getApiBase();
      const endpoint = isSetup ? '/auth/setup' : '/auth/login';
      const res = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'エラー');
      }
      const data = await res.json();
      setToken(data.token);
      if (isSetup) setHasPin(true);
      try { soundSessionStart(); } catch {}
      setJackIn(true);
      track(isSetup ? 'login_pin_setup' : 'login_pin_success');
      setTimeout(() => onLogin?.(), 1000);
    } catch (err) {
      setError(err.message);
      track('login_pin_failed', { reason: err.message, setup: isSetup });
      setLoading(false);
      setPin('');
    }
  };

  // 段階1+2: 自動ログイン試行が完了するまで PIN/Google 画面を出さず、
  // ローディング画面を維持する（PIN画面が一瞬チラ見えする問題への対応）。
  if (hasPin === null || !autoLoginAttempted) {
    return (
      <div className="flex items-center justify-center h-full cyber-floor scanlines">
        <div className="w-12 h-12 rounded-xl bg-[#0a0a0b] border border-cyber-600/30 flex items-center justify-center animate-glow-pulse relative z-10">
          <span className="text-[#22c55e] text-sm font-mono font-bold">&gt;_C</span>
        </div>
      </div>
    );
  }

  if (!googleSession) {
    return (
      <div className="flex flex-col items-center justify-center h-full cyber-floor scanlines px-6 animate-fade-in">
        <div className="w-full max-w-xs relative z-10">
          <div className="flex justify-center mb-5">
            <div className="w-14 h-14 rounded-xl bg-[#0a0a0b] border border-cyber-600/30 flex items-center justify-center animate-glow-pulse">
              <span className="text-[#22c55e] text-base font-mono font-bold">&gt;_C</span>
            </div>
          </div>
          <div className="text-center mb-6">
            <h1 className="text-2xl font-pixel text-navi-glow mb-2 tracking-wider animate-neon-flicker">
              CC REMOTE
            </h1>
            {pcLabel && (
              <div className="text-exe-green text-sm font-mono mb-1 tracking-wider">
                → {pcLabel}
              </div>
            )}
            <div className="text-txt-muted text-xs font-mono tracking-[0.15em]">
              // Googleでログイン
            </div>
          </div>
          {error && (
            <div className="text-alert-red text-center text-xs mb-3 font-mono animate-fade-in">
              ! ERROR: {error}
            </div>
          )}
          <div ref={googleBtnRef} className="flex justify-center" />
          <div className="text-txt-muted/40 text-center text-[10px] mt-4 font-mono">
            v4.0 // Google + PIN
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center h-full cyber-floor scanlines px-6 transition-all duration-1000 ${jackIn ? 'scale-[1.3] opacity-0 blur-sm' : 'animate-fade-in scale-100 opacity-100'}`}>
      <div className="w-full max-w-xs relative z-10">
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-xl bg-[#0a0a0b] border border-cyber-600/30 flex items-center justify-center animate-glow-pulse">
            <span className="text-[#22c55e] text-base font-mono font-bold">&gt;_C</span>
          </div>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-pixel text-navi-glow mb-2 tracking-wider animate-neon-flicker">
            CC REMOTE
          </h1>
          {pcLabel && (
            <div className="text-exe-green text-sm font-mono mb-1 tracking-wider">
              → {pcLabel}
            </div>
          )}
          <div className="text-txt-muted text-xs font-mono tracking-[0.15em]">
            {isSetup
              ? (isConfirming ? '// CONFIRM PIN (4 digits)' : '// SET PIN (4 digits)')
              : '// ENTER PIN'}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <PinDots pin={pin} />

          {error && (
            <div className="text-alert-red text-center text-xs mb-3 font-mono animate-fade-in">
              ! ERROR: {error}
            </div>
          )}

          <Numpad onNumpad={handleNumpad} />

          <button
            type="submit"
            disabled={pin.length < PIN_MIN || loading}
            className="w-full py-3 rounded-lg font-bold text-sm font-pixel tracking-wider transition-all
              neon-btn text-txt-bright shadow-neon-blue
              disabled:opacity-20 disabled:cursor-not-allowed"
          >
            {loading
              ? 'CONNECTING...'
              : isSetup
                ? (isConfirming ? 'SET PIN' : 'NEXT')
                : 'PLUG IN'}
          </button>
        </form>

        <div className="text-txt-muted/40 text-center text-[10px] mt-4 font-mono">
          v4.0 // P2P, no central server
        </div>
      </div>
    </div>
  );
}
