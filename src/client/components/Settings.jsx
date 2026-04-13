import { useState, useEffect } from 'react';
// v4: QRConnect は廃止（中央サーバー経由ペアリングなし、AddPCLocal で URL 直入力 / QR 読取は v4.1）
import BugReport from './BugReport';
import { startBGM, stopBGM, isBGMPlaying } from '../utils/sounds';
import { setRemoteBase, getRemoteBase, getToken, clearToken, setToken, getApiBase, getAuthHeaders, isCloudMode, getCloudUrl, clearPinSessionToken, getActivePcId } from '../utils/api';

function PinChangeModal({ onClose }) {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = async () => {
    if (!/^\d{4}$/.test(oldPin) || !/^\d{4}$/.test(newPin)) {
      setError('4桁の数字で入力してください');
      return;
    }
    setLoading(true);
    setError('');
    setMsg('');
    try {
      // Rev 4 Follow-up US-003:
      //   cloud mode → cloud-server /api/auth/pin-change (Firebase+Firestore PIN)
      //   local mode → PC Agent    /api/auth/change-pin  (legacy local PIN)
      const cloud = isCloudMode();
      const url = cloud ? `${getCloudUrl()}/api/auth/pin-change` : '/api/auth/change-pin';
      const headers = cloud
        ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken() || ''}` }
        : { 'Content-Type': 'application/json', ...getAuthHeaders() };
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ oldPin, newPin }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `エラー (${res.status})`);
      }
      setMsg('PIN変更完了。再ログインします...');
      setTimeout(() => {
        if (cloud) clearPinSessionToken();
        clearToken();
        location.reload();
      }, 1500);
    } catch (e) {
      setError(e.message || 'エラー');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="pet-frame p-5 w-full max-w-xs" onClick={e => e.stopPropagation()}>
        <h3 className="text-navi-glow font-bold font-mono mb-4">PIN CHANGE</h3>
        <input type="tel" maxLength={4} placeholder="現在のPIN" value={oldPin} onChange={e => setOldPin(e.target.value.replace(/\D/g,''))}
          className="w-full bg-cyber-bg border border-cyber-500 rounded px-3 py-2 text-sm font-mono text-txt-secondary mb-2" />
        <input type="tel" maxLength={4} placeholder="新しいPIN" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g,''))}
          className="w-full bg-cyber-bg border border-cyber-500 rounded px-3 py-2 text-sm font-mono text-txt-secondary mb-3" />
        {error && <div className="text-alert-red text-xs font-mono mb-2">ERROR: {error}</div>}
        {msg && <div className="text-exe-green text-xs font-mono mb-2">{msg}</div>}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={loading} className="flex-1 chip-btn py-2">CANCEL</button>
          <button onClick={handleChange} disabled={loading} className="flex-1 neon-btn text-white py-2 rounded text-sm font-mono">
            {loading ? 'CHANGING...' : 'CHANGE'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings({ onClose, onLogout, token, onPcChange, onShowStatus, onShowFiles, onShowDashboard }) {
  const [showPinChange, setShowPinChange] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [pcs, setPcs] = useState([]);
  const [loadingPcs, setLoadingPcs] = useState(true);
  const [fontSize, setFontSize] = useState(
    parseInt(localStorage.getItem('ccr-fontsize') || '13')
  );
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem('ccr-theme') !== 'light'
  );
  const [sleepMode, setSleepMode] = useState(false);
  const [shortcuts, setShortcuts] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [notifSettings, setNotifSettings] = useState({ silentEnabled: false, silentStart: 23, silentEnd: 7, errorOnly: false });
  const [soundOn, setSoundOn] = useState(localStorage.getItem('ccr-sound') !== 'off');
  const [bgmOn, setBgmOn] = useState(localStorage.getItem('ccr-bgm') === 'on');
  const [aiChar, setAiChar] = useState('default');
  const [aiChars, setAiChars] = useState({});
  const [showBugReport, setShowBugReport] = useState(false);
  const [webAuthnRegistered, setWebAuthnRegistered] = useState(false);
  const [webAuthnLoading, setWebAuthnLoading] = useState(false);
  const [webAuthnMsg, setWebAuthnMsg] = useState('');
  const [webAuthnError, setWebAuthnError] = useState('');

  // PC一覧 + 就寝モード + ショートカット取得
  useEffect(() => {
    fetchPcs();
    fetchSleepMode();
    fetchShortcuts();
    fetchNotifSettings();
    fetchAiCharacter();
    checkWebAuthnRegistered();
  }, []);

  const fetchPcs = async () => {
    try {
      const res = await fetch(`${getApiBase()}/pcs`, { headers: getAuthHeaders() });
      if (res.ok) {
        const raw = await res.json();
        // Rev 5 REV5-002: 正規化 + dedupe
        const list = normalizeAndDedupePcs(raw);
        setPcs(list);
        checkPcHealth(list);
      }
    } catch (e) { console.warn('[Settings]', e.message); }
    setLoadingPcs(false);
  };

  const fetchSleepMode = async () => {
    try {
      const res = await fetch(`${getApiBase()}/sleep-mode`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSleepMode(data.sleepDisabled);
      }
    } catch (e) { console.warn('[Settings]', e.message); }
  };

  const fetchShortcuts = async () => {
    try {
      const res = await fetch(`${getApiBase()}/shortcuts`, { headers: getAuthHeaders() });
      if (res.ok) setShortcuts(await res.json());
    } catch (e) { console.warn('[Settings]', e.message); }
  };

  const addShortcut = async () => {
    if (!newLabel.trim() || !newCommand.trim()) return;
    try {
      const res = await fetch(`${getApiBase()}/shortcuts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ label: newLabel.trim(), command: newCommand.trim() }),
      });
      if (res.ok) {
        setNewLabel(''); setNewCommand('');
        await fetchShortcuts();
      }
    } catch (e) { console.warn('[Settings]', e.message); }
  };

  const deleteShortcut = async (id) => {
    try {
      await fetch(`${getApiBase()}/shortcuts/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      await fetchShortcuts();
    } catch (e) { console.warn('[Settings]', e.message); }
  };

  const fetchNotifSettings = async () => {
    try {
      const res = await fetch(`${getApiBase()}/notification-settings`, { headers: getAuthHeaders() });
      if (res.ok) setNotifSettings(await res.json());
    } catch (e) { console.warn('[Settings]', e.message); }
  };

  const updateNotifSettings = async (updates) => {
    const next = { ...notifSettings, ...updates };
    setNotifSettings(next);
    try {
      await fetch(`${getApiBase()}/notification-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(next),
      });
    } catch (e) { console.warn('[Settings]', e.message); }
  };

  const fetchAiCharacter = async () => {
    try {
      const res = await fetch(`${getApiBase()}/ai-character`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAiChar(data.current);
        setAiChars(data.characters);
      }
    } catch (e) { console.warn('[Settings]', e.message); }
  };

  const changeAiCharacter = async (char) => {
    setAiChar(char);
    try {
      await fetch(`${getApiBase()}/ai-character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ character: char }),
      });
    } catch (e) { console.warn('[Settings]', e.message); }
  };

  const checkWebAuthnRegistered = async () => {
    if (!window.PublicKeyCredential) return;
    try {
      const res = await fetch('/api/auth/webauthn/login/challenge', { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        if (d?.credentialId) setWebAuthnRegistered(true);
      }
    } catch (e) { console.warn('[Settings]', e.message); }
  };

  const handleWebAuthnRegister = async () => {
    if (!window.PublicKeyCredential) {
      setWebAuthnError('このデバイスはWebAuthn未対応です');
      return;
    }
    setWebAuthnLoading(true);
    setWebAuthnMsg('');
    setWebAuthnError('');
    try {
      // チャレンジ取得
      const challengeRes = await fetch('/api/auth/webauthn/register/challenge', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!challengeRes.ok) throw new Error('チャレンジ取得に失敗しました');
      const { challenge } = await challengeRes.json();

      const challengeBytes = Uint8Array.from(
        challenge.match(/.{1,2}/g).map(b => parseInt(b, 16))
      );

      // navigator.credentials.create
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challengeBytes,
          rp: { name: 'CC Remote', id: location.hostname },
          user: {
            id: new TextEncoder().encode('ccremote-user'),
            name: 'ccremote',
            displayName: 'CC Remote User',
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },   // ES256
            { alg: -257, type: 'public-key' },  // RS256
          ],
          authenticatorSelection: {
            userVerification: 'preferred',
            residentKey: 'discouraged',
          },
          timeout: 60000,
        },
      });

      const credentialId = Array.from(new Uint8Array(credential.rawId))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const publicKey = Array.from(new Uint8Array(credential.response.getPublicKey?.() || []))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const saveRes = await fetch('/api/auth/webauthn/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ credentialId, publicKey }),
      });
      if (!saveRes.ok) {
        const d = await saveRes.json().catch(() => ({}));
        throw new Error(d.error || '登録に失敗しました');
      }
      setWebAuthnRegistered(true);
      setWebAuthnMsg('生体認証を登録しました');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setWebAuthnError('生体認証がキャンセルされました');
      } else {
        setWebAuthnError(err.message || '登録エラー');
      }
    }
    setWebAuthnLoading(false);
  };

  const toggleSound = (on) => {
    setSoundOn(on);
    localStorage.setItem('ccr-sound', on ? 'on' : 'off');
  };

  const toggleBGM = (on) => {
    setBgmOn(on);
    localStorage.setItem('ccr-bgm', on ? 'on' : 'off');
    if (on) {
      startBGM();
    } else {
      stopBGM();
    }
  };

  const toggleDarkMode = (on) => {
    setDarkMode(on);
    localStorage.setItem('ccr-theme', on ? 'dark' : 'light');
    document.documentElement.classList.toggle('light-mode', !on);
  };

  const [switching, setSwitching] = useState(null);
  const [pcHealth, setPcHealth] = useState({});
  const [editingPcId, setEditingPcId] = useState(null);
  const [editingPcName, setEditingPcName] = useState('');
  const [remotePinDialog, setRemotePinDialog] = useState(null); // { url, pcName }
  const [remotePinValue, setRemotePinValue] = useState('');
  const [remotePinError, setRemotePinError] = useState('');
  const [remotePinLoading, setRemotePinLoading] = useState(false);
  // Rev 5 REV5-002: 古い (7 日以上オフライン) PC の展開トグル
  const [showStalePcs, setShowStalePcs] = useState(false);

  // PC一覧取得後にヘルスチェックを並列実行
  const checkPcHealth = async (pcList) => {
    const results = {};
    await Promise.all(
      pcList.map(async (pc) => {
        if (pc.isLocal) {
          results[pc.id] = 'online';
          return;
        }
        try {
          const res = await fetch(`${pc.url}/api/pcs/health`, {
            signal: AbortSignal.timeout(3000),
          });
          results[pc.id] = res.ok ? 'online' : 'offline';
        } catch {
          results[pc.id] = 'offline';
        }
      })
    );
    setPcHealth(results);
  };

  const renamePc = async (id) => {
    const name = editingPcName.trim();
    if (!name) { setEditingPcId(null); return; }
    try {
      const res = await fetch(`${getApiBase()}/pcs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setPcs(prev => prev.map(p => p.id === id ? { ...p, name } : p));
      }
    } catch (e) { console.warn('[Settings]', e.message); }
    setEditingPcId(null);
  };

  const activatePc = async (id) => {
    setSwitching(id);
    try {
      const res = await fetch(`${getApiBase()}/pcs/${id}/activate`, { method: 'POST', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('切り替え失敗');
      const data = await res.json();

      if (data.isLocal) {
        // ローカルPC — ベースURLをリセット
        setRemoteBase('');
        await fetchPcs();
        if (onPcChange) onPcChange();
      } else {
        // リモートPC — まずヘルスチェック
        try {
          const health = await fetch(`${data.url}/api/pcs/health`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!health.ok) throw new Error();
        } catch {
          setSwitching(null);
          alert('接続先PCがオフラインです');
          return;
        }
        // PINダイアログを表示してリモートPCにログイン
        setRemotePinDialog({ url: data.url, pcName: data.name || id });
        setRemotePinValue('');
        setRemotePinError('');
      }
    } catch (e) {
      alert(e.message || 'PC切り替えに失敗しました');
    }
    setSwitching(null);
  };

  const handleRemotePinConnect = async () => {
    if (!remotePinDialog) return;
    if (remotePinValue.length !== 4) { setRemotePinError('4桁のPINを入力してください'); return; }
    setRemotePinLoading(true);
    setRemotePinError('');
    try {
      const res = await fetch(`${remotePinDialog.url}/api/auth/login`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: remotePinValue }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'PIN認証失敗');
      }
      const data = await res.json();
      // トークンをリモートPC用キーに保存してからベースURLを切り替え
      setRemoteBase(remotePinDialog.url);
      setToken(data.token);
      setRemotePinDialog(null);
      if (onPcChange) onPcChange();
      onClose();
    } catch (e) {
      setRemotePinError(e.message || '接続エラー');
    }
    setRemotePinLoading(false);
  };

  const deletePc = async (id) => {
    try {
      await fetch(`${getApiBase()}/pcs/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      await fetchPcs();
      if (onPcChange) onPcChange();
    } catch (e) { console.warn('[Settings]', e.message); }
  };

  const handleFontSize = (size) => {
    setFontSize(size);
    localStorage.setItem('ccr-fontsize', String(size));
  };

  const toggleSleepMode = async (on) => {
    setSleepMode(on);
    try {
      await fetch(`${getApiBase()}/sleep-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ enabled: on }),
      });
    } catch (e) { console.warn('[Settings]', e.message); }
  };

  return (
    <div className="flex flex-col h-full bg-cyber-bg">
      {showPinChange && <PinChangeModal onClose={() => setShowPinChange(false)} />}
      {/* v4: QRConnect 廃止 */}
      {showBugReport && <BugReport token={token} onClose={() => setShowBugReport(false)} />}
      {remotePinDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setRemotePinDialog(null)}>
          <div className="pet-frame p-5 w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <h3 className="text-navi-glow font-bold font-mono mb-1">REMOTE PIN LOGIN</h3>
            <div className="text-txt-muted text-xs font-mono mb-4">{remotePinDialog.pcName}</div>
            <div className="text-txt-secondary text-xs font-mono mb-3">リモートPCのPINを入力</div>
            <input
              type="tel"
              maxLength={4}
              placeholder="4桁のPIN"
              value={remotePinValue}
              onChange={e => setRemotePinValue(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleRemotePinConnect()}
              autoFocus
              className="w-full bg-cyber-bg border border-cyber-500 rounded px-3 py-2 text-sm font-mono text-txt-secondary mb-3 text-center tracking-widest"
            />
            {remotePinError && <div className="text-alert-red text-xs font-mono mb-2">ERROR: {remotePinError}</div>}
            <div className="flex gap-2">
              <button onClick={() => setRemotePinDialog(null)} className="flex-1 chip-btn py-2">CANCEL</button>
              <button
                onClick={handleRemotePinConnect}
                disabled={remotePinLoading}
                className="flex-1 neon-btn text-white py-2 rounded text-sm font-mono disabled:opacity-40"
              >
                {remotePinLoading ? '...' : '接続'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-cyber-surface border-b border-cyber-border px-4 py-3 flex items-center">
        <button onClick={onClose} className="text-cyber-accent mr-3 text-lg">←</button>
        <span className="font-bold text-cyber-text">設定</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* PC管理 */}
        <Section title="PC管理" desc="接続先PCの切り替え・追加">
          <div className="space-y-2">
            {loadingPcs ? (
              <div className="text-txt-muted text-xs font-mono animate-pulse">読み込み中...</div>
            ) : pcs.length === 0 ? (
              <div className="text-txt-muted text-xs font-mono">登録PCなし</div>
            ) : (
              // Rev 5 REV5-002: active / stale に分割して表示、stale はデフォルト折りたたみ
              (() => {
                const activePcs = pcs.filter(pc => !isStalePc(pc));
                const stalePcs = pcs.filter(pc => isStalePc(pc));
                const visiblePcs = showStalePcs ? [...activePcs, ...stalePcs] : activePcs;
                return (
                  <>
                    {visiblePcs.map(pc => {
                const health = pcHealth[pc.id];
                const isOnline = health === 'online';
                const isChecking = health === undefined;
                return (
                  <div key={pc.id} className={`flex items-center gap-2 p-2 rounded-lg border text-sm font-mono
                    ${pc.isCurrent
                      ? 'border-navi-glow/50 bg-navi/10 text-navi-glow'
                      : 'border-cyber-border text-txt-secondary'}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${pc.isCurrent ? 'bg-navi-glow animate-glow-pulse' : 'bg-cyber-600'}`} />
                    <div className="flex-1 min-w-0">
                      {editingPcId === pc.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={editingPcName}
                            onChange={e => setEditingPcName(e.target.value)}
                            onBlur={() => renamePc(pc.id)}
                            onKeyDown={e => { if (e.key === 'Enter') renamePc(pc.id); if (e.key === 'Escape') setEditingPcId(null); }}
                            className="flex-1 bg-cyber-bg border border-navi rounded px-1.5 py-0.5 text-xs font-mono text-txt-secondary min-w-0"
                          />
                        </div>
                      ) : (
                        <div className="truncate flex items-center gap-1.5">
                          <span
                            className="cursor-pointer hover:text-navi-glow"
                            onClick={() => { setEditingPcId(pc.id); setEditingPcName(pc.name); }}
                            title="タップで名前変更"
                          >{pc.name}</span>
                          {pc.isLocal && <span className="text-[9px] text-exe-green border border-exe-green/30 rounded px-1">LOCAL</span>}
                          {pc.isCurrent && <span className="text-[9px] text-navi border border-navi/30 rounded px-1">ACTIVE</span>}
                          {isChecking ? (
                            <span className="text-[9px] text-txt-muted border border-cyber-border rounded px-1 animate-pulse">...</span>
                          ) : isOnline ? (
                            <span className="text-[9px] text-exe-green border border-exe-green/40 rounded px-1">ONLINE</span>
                          ) : (
                            <span className="text-[9px] text-alert-red border border-alert-red/40 rounded px-1">OFFLINE</span>
                          )}
                        </div>
                      )}
                      <div className="text-[10px] text-txt-muted truncate flex gap-1.5 mt-0.5">
                        <span className="truncate">{pc.url || '—'}</span>
                        {relativeTime(pc.lastSeen) && <span className="flex-shrink-0 text-cyber-dim">{relativeTime(pc.lastSeen)}</span>}
                      </div>
                    </div>
                    {!pc.isCurrent && (
                      <button
                        onClick={() => activatePc(pc.id)}
                        disabled={switching === pc.id}
                        className="chip-btn text-[10px] px-2 py-1 min-h-0 disabled:opacity-50"
                      >
                        {switching === pc.id ? '...' : '接続'}
                      </button>
                    )}
                    {/* Rev 6: 削除ボタンを常時表示 (current/local 含めて全 PC 削除可能、確認ダイアログ付き) */}
                    <button
                      onClick={() => {
                        if (confirm(`PC「${pc.name || pc.id}」を削除しますか？`)) {
                          deletePc(pc.id);
                        }
                      }}
                      className="text-alert-red text-sm px-2 py-1 hover:text-alert-red/80"
                      title="削除"
                      aria-label="削除"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
                    {stalePcs.length > 0 && (
                      <button
                        onClick={() => setShowStalePcs(v => !v)}
                        className="w-full text-center py-1.5 text-[10px] font-mono text-txt-muted hover:text-navi-glow border border-dashed border-cyber-border rounded transition-all"
                      >
                        {showStalePcs ? '古い PC を隠す' : `古い PC を表示 (${stalePcs.length})`}
                      </button>
                    )}
                  </>
                );
              })()
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                const url = prompt('PCのトンネルURLを入力:');
                if (!url) return;
                const name = prompt('PC名（任意）:') || 'PC';
                fetch(`${getApiBase()}/pcs`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify({ name, url: url.trim() }),
                }).then(() => fetchPcs());
              }}
              className="flex-1 py-2 rounded-lg border border-navi text-navi text-xs font-mono"
            >
              URL追加
            </button>
          </div>
        </Section>

        {/* 文字サイズ */}
        <Section title="文字サイズ">
          <div className="flex gap-2">
            {[11, 13, 15, 17].map(size => (
              <button
                key={size}
                onClick={() => handleFontSize(size)}
                className={`px-4 py-2 rounded-lg border text-sm font-mono
                  ${fontSize === size
                    ? 'bg-cyber-accent/20 border-cyber-accent text-cyber-accent'
                    : 'border-cyber-border text-cyber-dim'}`}
              >
                {size === 11 ? '小' : size === 13 ? '中' : size === 15 ? '大' : '特大'}
              </button>
            ))}
          </div>
        </Section>

        {/* フォント選択 */}
        <Section title="フォント">
          <div className="flex gap-2 flex-wrap">
            {[
              { name: 'Mono', value: '"Share Tech Mono", monospace' },
              { name: 'Pixel', value: '"Press Start 2P", monospace' },
              { name: 'Gothic', value: '"DotGothic16", monospace' },
              { name: 'System', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
            ].map(f => (
              <button
                key={f.name}
                onClick={() => {
                  document.body.style.fontFamily = f.value;
                  localStorage.setItem('ccr-font', f.value);
                }}
                className="px-3 py-1.5 rounded border border-cyber-border text-[10px] font-mono text-txt-secondary hover:border-navi"
                style={{ fontFamily: f.value }}
              >
                {f.name}
              </button>
            ))}
          </div>
        </Section>

        {/* 就寝モード */}
        <Section title="就寝モード" desc="ONの間、PCのスリープを抑制します">
          <Toggle checked={sleepMode} onChange={toggleSleepMode} />
        </Section>

        {/* 通知設定 */}
        <Section title="通知設定">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-txt-secondary font-mono">サイレントアワー</span>
              <Toggle checked={notifSettings.silentEnabled} onChange={v => updateNotifSettings({ silentEnabled: v })} />
            </div>
            {notifSettings.silentEnabled && (
              <div className="flex items-center gap-2 text-xs font-mono text-txt-muted">
                <input type="number" min="0" max="23" value={notifSettings.silentStart}
                  onChange={e => updateNotifSettings({ silentStart: parseInt(e.target.value) || 0 })}
                  className="w-12 bg-cyber-bg border border-cyber-500 rounded px-1 py-1 text-center text-txt-secondary"
                />
                <span>時 〜</span>
                <input type="number" min="0" max="23" value={notifSettings.silentEnd}
                  onChange={e => updateNotifSettings({ silentEnd: parseInt(e.target.value) || 0 })}
                  className="w-12 bg-cyber-bg border border-cyber-500 rounded px-1 py-1 text-center text-txt-secondary"
                />
                <span>時</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-txt-secondary font-mono">エラーのみ通知</span>
              <Toggle checked={notifSettings.errorOnly} onChange={v => updateNotifSettings({ errorOnly: v })} />
            </div>
          </div>
        </Section>

        {/* Rev 5: Chatwork 連携 UI は一旦非表示 (Chatwork → PC 方向は別アプリで実装予定) */}
        {/* <ChatworkSection /> */}

        {/* BGM セクションは削除 (2026-04-12 ユーザー指示) */}

        {/* ダークモード */}
        <Section title="ダークモード">
          <Toggle checked={darkMode} onChange={toggleDarkMode} />
        </Section>

        {/* ショートカット編集 */}
        <Section title="ショートカット" desc="よく使うコマンドをカスタマイズ">
          <div className="space-y-1.5 mb-3">
            {shortcuts.length === 0 ? (
              <div className="text-txt-muted text-xs font-mono">登録なし</div>
            ) : shortcuts.map(s => (
              <div key={s.id} className="flex items-center gap-2 p-1.5 rounded border border-cyber-border text-xs font-mono">
                <span className="text-navi-glow flex-shrink-0">{s.label}</span>
                <span className="text-txt-muted flex-1 truncate">{s.command}</span>
                <button onClick={() => deleteShortcut(s.id)} className="text-alert-red text-[10px] px-1 flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="ラベル"
              className="w-20 bg-cyber-bg border border-cyber-500 rounded px-2 py-1.5 text-xs font-mono text-txt-secondary"
            />
            <input
              value={newCommand} onChange={e => setNewCommand(e.target.value)}
              placeholder="コマンド"
              className="flex-1 bg-cyber-bg border border-cyber-500 rounded px-2 py-1.5 text-xs font-mono text-txt-secondary"
            />
            <button onClick={addShortcut} className="chip-btn text-[10px] px-3 py-2 min-h-[36px]">追加</button>
          </div>
        </Section>

        {/* カスタムカラー */}
        <Section title="テーマカラー" desc="アクセントカラーを変更">
          <div className="flex gap-2 flex-wrap">
            {[
              { name: 'CYBER', accent: '#00e8d8', primary: '#0070ec' },
              { name: 'FIRE', accent: '#ff6b35', primary: '#cc2200' },
              { name: 'SAKURA', accent: '#ff69b4', primary: '#c71585' },
              { name: 'GOLD', accent: '#ffd700', primary: '#b8860b' },
              { name: 'LIME', accent: '#00ff41', primary: '#00a030' },
              { name: 'PURPLE', accent: '#b366ff', primary: '#7b2fbe' },
            ].map(theme => (
              <button
                key={theme.name}
                onClick={() => {
                  document.documentElement.style.setProperty('--navi-glow', theme.accent);
                  document.documentElement.style.setProperty('--navi-blue', theme.primary);
                  localStorage.setItem('ccr-theme-accent', theme.accent);
                  localStorage.setItem('ccr-theme-primary', theme.primary);
                }}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-cyber-border text-[10px] font-mono text-txt-secondary hover:border-navi"
              >
                <span className="w-3 h-3 rounded-full" style={{ background: theme.accent }} />
                {theme.name}
              </button>
            ))}
          </div>
        </Section>

        {/* AIキャラ設定 */}
        <Section title="AIキャラクター" desc="Claudeの口調を変更">
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(aiChars).map(([key, val]) => (
              <button
                key={key}
                onClick={() => changeAiCharacter(key)}
                className={`px-2.5 py-1.5 rounded border text-[10px] font-mono transition-all ${
                  aiChar === key
                    ? 'border-navi-glow bg-navi/10 text-navi-glow'
                    : 'border-cyber-border text-txt-muted'
                }`}
              >
                {val.name}
              </button>
            ))}
          </div>
        </Section>

        {/* PIN変更 */}
        <Section title="PIN変更">
          <button
            onClick={() => setShowPinChange(true)}
            className="text-cyber-accent text-sm underline"
          >
            PINを変更する
          </button>
        </Section>

        {/* 生体認証 */}
        {window.PublicKeyCredential && (
          <Section title="生体認証" desc="指紋・顔認証でログイン">
            {webAuthnRegistered ? (
              <div className="flex items-center gap-3">
                <span className="text-exe-green text-xs font-mono">登録済み</span>
                <button
                  onClick={handleWebAuthnRegister}
                  disabled={webAuthnLoading}
                  className="chip-btn text-[10px] px-3 py-1.5 min-h-0 disabled:opacity-40"
                >
                  {webAuthnLoading ? '...' : '再登録'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleWebAuthnRegister}
                disabled={webAuthnLoading}
                className="chip-btn text-sm px-4 py-2 disabled:opacity-40"
              >
                {webAuthnLoading ? '登録中...' : '生体認証を登録'}
              </button>
            )}
            {webAuthnMsg && <div className="text-exe-green text-xs font-mono mt-2">{webAuthnMsg}</div>}
            {webAuthnError && <div className="text-alert-red text-xs font-mono mt-2">ERROR: {webAuthnError}</div>}
          </Section>
        )}

        {/* フィードバック */}
        <Section title="フィードバック">
          <button
            onClick={() => setShowBugReport(true)}
            className="text-navi text-sm font-mono underline"
          >
            バグ報告・要望を送る
          </button>
        </Section>

        {/* ユーザー管理 — PCごとのアクセス管理 */}
        <UserManagementSection token={token} />

        {/* ログアウト */}
        <div className="pt-4">
          <button
            onClick={onLogout}
            className="w-full py-3 rounded-lg border border-alert-red/50 text-alert-red text-sm font-mono"
          >
            LOGOUT
          </button>
        </div>

        <div className="text-center text-cyber-dim text-xs pt-4 space-y-1">
          <div>CC Remote v3.0.0</div>
          <div className="flex items-center justify-center gap-3">
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-cyber-dim underline hover:text-cyber-accent">利用規約</a>
            <span className="text-cyber-dim opacity-50">|</span>
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-cyber-dim underline hover:text-cyber-accent">プライバシーポリシー</a>
          </div>
        </div>
      </div>
    </div>
  );
}

// Rev 5 REV5-002: null/undefined/NaN/string を正規化し、無効値なら空文字を返す。
function relativeTime(raw) {
  if (raw == null || raw === '') return '';
  const ms = typeof raw === 'string' ? Date.parse(raw) : Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const diff = Date.now() - ms;
  if (diff < 0) return '';
  const s = Math.floor(diff / 1000);
  if (s < 60) return '最終: たった今';
  const m = Math.floor(s / 60);
  if (m < 60) return `最終: ${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `最終: ${h}時間前`;
  const d = Math.floor(h / 24);
  return `最終: ${d}日前`;
}

// Rev 5 REV5-002: PC レスポンスを UI が扱う形に正規化 + dedupe (id ベース + hostname 最新のみ)
function normalizeAndDedupePcs(list) {
  const normalized = (list || []).map(pc => {
    const id = pc.id || pc.pcId;
    const name = pc.name || pc.displayName || pc.hostname || 'Unknown PC';
    const url = pc.url || pc.tunnelUrl || '';
    const lastSeen = pc.lastSeen ?? pc.last_seen ?? null;
    return { ...pc, id, name, url, lastSeen };
  }).filter(pc => !!pc.id);
  // id で dedupe (最新 lastSeen を残す)
  const byId = new Map();
  for (const pc of normalized) {
    const existing = byId.get(pc.id);
    if (!existing) { byId.set(pc.id, pc); continue; }
    const a = Number(existing.lastSeen || 0);
    const b = Number(pc.lastSeen || 0);
    if (b > a) byId.set(pc.id, pc);
  }
  // 同 hostname は最新 heartbeat を 1 件だけ
  const byHost = new Map();
  const anonymous = [];
  for (const pc of byId.values()) {
    const host = (pc.hostname || pc.name || '').toLowerCase();
    if (!host || host === 'unknown pc') { anonymous.push(pc); continue; }
    const existing = byHost.get(host);
    if (!existing) { byHost.set(host, pc); continue; }
    const a = Number(existing.lastSeen || 0);
    const b = Number(pc.lastSeen || 0);
    if (b > a) byHost.set(host, pc);
  }
  return [...byHost.values(), ...anonymous];
}

// Rev 5 REV5-002: 7 日以上 heartbeat の無い PC を "stale" と判定
function isStalePc(pc) {
  const raw = pc.lastSeen;
  if (raw == null) return true;
  const ms = typeof raw === 'string' ? Date.parse(raw) : Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) return true;
  return (Date.now() - ms) > 7 * 24 * 60 * 60 * 1000;
}

function UserManagementSection({ token }) {
  const [pcs, setPcs] = useState([]);
  const [selectedPc, setSelectedPc] = useState(null);
  const [users, setUsers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`${getApiBase()}/pcs`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(list => setPcs(list.filter(p => p.connected || p.status === 'online')))
      .catch(() => {});
  }, [token]);

  const loadUsers = async (pcId) => {
    setSelectedPc(pcId);
    setUsers([]);
    setMsg('');
    try {
      const res = await fetch(`${getApiBase()}/pcs/${pcId}/users`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) { setMsg('通信エラー: ' + e.message); }
  };

  const invite = async () => {
    if (!inviteEmail || !selectedPc) return;
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch(`${getApiBase()}/pcs/${selectedPc}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg('招待しました');
        setInviteEmail('');
        loadUsers(selectedPc);
      } else {
        setMsg(data.error || '招待に失敗');
      }
    } catch (e) {
      setMsg(e.message);
    }
    setLoading(false);
  };

  const removeUser = async (uid) => {
    if (!confirm('このユーザーのアクセスを削除しますか？')) return;
    try {
      const res = await fetch(`${getApiBase()}/pcs/${selectedPc}/users/${uid}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) loadUsers(selectedPc);
      else setMsg('削除に失敗しました');
    } catch (e) { setMsg('通信エラー'); }
  };

  if (pcs.length === 0) return null;

  return (
    <Section title="ユーザー管理" desc="PCごとのアクセス権限を管理">
      <div className="flex gap-1 mb-2 overflow-x-auto">
        {pcs.map(pc => (
          <button
            key={pc.id}
            onClick={() => loadUsers(pc.id)}
            className={`px-2 py-1 rounded text-xs font-mono border ${selectedPc === pc.id ? 'border-navi/60 text-navi-glow bg-navi/10' : 'border-cyber-600/40 text-txt-muted'}`}
          >
            {pc.name || pc.hostname || pc.id}
          </button>
        ))}
      </div>
      {selectedPc && (
        <>
          <div className="space-y-1 mb-2">
            {users.map(u => (
              <div key={u.uid} className="flex items-center justify-between px-2 py-1 bg-cyber-900/50 rounded text-xs font-mono">
                <span className="text-txt-muted">{u.email || u.uid}</span>
                <span className="flex items-center gap-2">
                  <span className={u.role === 'owner' ? 'text-exe-yellow' : 'text-txt-muted/60'}>{u.role === 'owner' ? 'オーナー' : '編集者'}</span>
                  {u.role !== 'owner' && (
                    <button onClick={() => removeUser(u.uid)} className="text-alert-red/70 hover:text-alert-red text-[10px]">✕</button>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="メールアドレス"
              className="flex-1 px-2 py-1 bg-cyber-900 border border-cyber-600/40 rounded text-xs text-txt-bright font-mono"
            />
            <button
              onClick={invite}
              disabled={loading || !inviteEmail}
              className="px-3 py-1 bg-navi/20 border border-navi/50 rounded text-xs text-navi-glow font-mono disabled:opacity-50"
            >
              招待
            </button>
          </div>
          {msg && <div className="text-xs font-mono mt-1 text-exe-yellow">{msg}</div>}
        </>
      )}
    </Section>
  );
}

function Section({ title, desc, children }) {
  return (
    <div>
      <div className="text-sm font-bold text-cyber-text mb-1">{title}</div>
      {desc && <div className="text-xs text-cyber-dim mb-2">{desc}</div>}
      {children}
    </div>
  );
}

// Rev 5: Chatwork 通知設定セクション
// API Token + Room ID + 有効化トグル + テスト送信
// PC が選択されていない場合 (cloud mode + 未ペアリング) は表示しない。
function ChatworkSection() {
  const [cfg, setCfg] = useState({ tokenPreview: '', hasToken: false, roomId: '', enabled: false, events: [] });
  const [tokenInput, setTokenInput] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const canShow = !isCloudMode() || !!getActivePcId();

  useEffect(() => {
    if (canShow) loadConfig();
  }, [canShow]);

  const loadConfig = async () => {
    try {
      const res = await fetch(`${getApiBase()}/chatwork/config`, {
        headers: getAuthHeaders(),
        mode: isCloudMode() ? 'cors' : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        setCfg(data);
        setRoomInput(data.roomId || '');
      }
    } catch (e) { console.warn('[Chatwork]', e.message); }
  };

  const saveConfig = async (patch) => {
    setMsg('');
    setErr('');
    setLoading(true);
    try {
      const body = { ...patch };
      const res = await fetch(`${getApiBase()}/chatwork/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        mode: isCloudMode() ? 'cors' : undefined,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('保存失敗');
      setTokenInput('');
      await loadConfig();
      setMsg('保存しました');
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  const sendTest = async () => {
    setMsg('');
    setErr('');
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/chatwork/test`, {
        method: 'POST',
        headers: getAuthHeaders(),
        mode: isCloudMode() ? 'cors' : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'テスト送信失敗');
      setMsg('テスト通知を送信しました');
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  if (!canShow) {
    return (
      <Section title="Chatwork 通知" desc="PC を選択すると設定できます">
        <div className="text-[10px] text-txt-muted font-mono">PCペアリング後に有効化してください</div>
      </Section>
    );
  }

  return (
    <Section title="Chatwork 通知" desc="タスク完了・エラー時に Chatwork ルームに通知を送ります">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-txt-secondary font-mono">有効化</span>
          <Toggle checked={cfg.enabled} onChange={(v) => saveConfig({ enabled: v })} />
        </div>
        <div>
          <label className="text-[10px] text-txt-muted font-mono block mb-1">
            API Token {cfg.hasToken ? `(設定済: ${cfg.tokenPreview})` : '(未設定)'}
          </label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Chatwork API Token"
            className="w-full bg-cyber-bg border border-cyber-500 rounded px-2 py-1.5 text-xs font-mono text-txt-secondary"
          />
        </div>
        <div>
          <label className="text-[10px] text-txt-muted font-mono block mb-1">Room ID</label>
          <input
            type="text"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            placeholder="例: 123456789"
            inputMode="numeric"
            className="w-full bg-cyber-bg border border-cyber-500 rounded px-2 py-1.5 text-xs font-mono text-txt-secondary"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const patch = { roomId: roomInput };
              if (tokenInput) patch.token = tokenInput;
              saveConfig(patch);
            }}
            disabled={loading}
            className="flex-1 chip-btn text-[10px] py-2 min-h-0 disabled:opacity-40"
          >
            保存
          </button>
          <button
            onClick={sendTest}
            disabled={loading || !cfg.hasToken}
            className="flex-1 neon-btn text-txt-bright text-[10px] py-2 rounded disabled:opacity-40"
          >
            テスト送信
          </button>
        </div>
        {msg && <div className="text-[10px] text-exe-green font-mono">{msg}</div>}
        {err && <div className="text-[10px] text-alert-red font-mono">ERROR: {err}</div>}
      </div>
    </Section>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(!checked)}
        className={`w-12 h-7 rounded-full relative transition-all duration-200 border ${
          checked
            ? 'bg-navi/40 border-navi/50 shadow-[0_0_4px_rgba(0,232,216,0.15)]'
            : 'bg-cyber-800 border-cyber-500'
        }`}
      >
        <div className={`w-5 h-5 rounded-full absolute top-0.5 transition-transform duration-200 ${
          checked
            ? 'translate-x-6 bg-navi-glow/80 shadow-[0_0_3px_rgba(0,232,216,0.3)]'
            : 'translate-x-0.5 bg-cyber-400'
        }`} />
      </button>
      <span className={`text-xs font-mono ${checked ? 'text-navi/70' : 'text-txt-muted'}`}>
        {checked ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}
