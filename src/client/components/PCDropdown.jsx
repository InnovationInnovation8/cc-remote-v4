// CC-Remote UI v2 — PCDropdown
// Header の中央右に配置する PC 切替ドロップダウン。
// - デスクトップ: position: absolute; top: calc(100% + 4px); right: 0
// - モバイル (isMobileWidth()): position: fixed; bottom: 0; left: 0; right: 0; height: 280px + バックドロップ
//
// props:
//   - pcs:          [{ id, label, url, lastHeartbeatAt? }]
//   - activePcId:   string | ''
//   - statuses:     { [pcId]: 'online' | 'offline' }
//   - onSelect:     (pcId, url, label) => void
//   - loading?:     boolean
//   - authError?:   boolean
//   - networkError?: boolean
//
// AC 対応: AC-03a / AC-03b / AC-03c / AC-03e
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { isMobileWidth } from '../utils/responsive';
import { track } from '../utils/analytics';

const DISPATCHER_URL = import.meta.env.VITE_DISPATCHER_URL || '';
const DISPATCHER_MODE = !!DISPATCHER_URL || import.meta.env.VITE_DISPATCHER_MODE === '1';

function isLocalPC(pc) {
  if (!pc.url) return true;
  try {
    return new URL(pc.url).origin === window.location.origin;
  } catch {
    return false;
  }
}

export default function PCDropdown({
  pcs = [],
  activePcId = '',
  statuses = {},
  onSelect,
  loading = false,
  authError = false,
  networkError = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mobile, setMobile] = useState(() => isMobileWidth());
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  // window resize に追随（デスクトップ⇔モバイル切り替え）
  useEffect(() => {
    const onResize = () => setMobile(isMobileWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 外側クリック / Escape で閉じる
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setIsOpen(false);
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const activePc = useMemo(() => pcs.find((p) => p.id === activePcId), [pcs, activePcId]);
  const label = activePc?.label || (pcs.length > 0 ? 'PCを選択' : 'PCなし');

  const handleToggle = useCallback(() => {
    setIsOpen((v) => !v);
  }, []);

  const handlePick = useCallback((pc) => {
    const status = statuses[pc.id];
    const isOnline = status === 'online';
    if (!isOnline) {
      track('pc_select_blocked_offline');
      return;
    }
    track('pc_selected', { is_local: isLocalPC(pc), dispatcher_mode: DISPATCHER_MODE, from: 'pc_dropdown' });
    setIsOpen(false);
    onSelect?.(pc.id, pc.url, pc.label);
  }, [statuses, onSelect]);

  const triggerBtn = (
    <button
      ref={triggerRef}
      type="button"
      aria-label="PCを切り替え"
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      onClick={handleToggle}
      className="flex items-center gap-1.5 px-2 py-1 rounded border border-cyber-600/40 bg-cyber-900/40 text-txt-muted hover:border-navi/50 hover:text-navi-glow transition-colors font-mono text-[11px] max-w-[200px]"
    >
      <span className="text-sm leading-none">🖥️</span>
      <span className="truncate max-w-[140px]">{label}</span>
      <span className={`text-[9px] leading-none transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
    </button>
  );

  const listItems = pcs.map((pc) => {
    const status = statuses[pc.id];
    const isOnline = status === 'online';
    const isActive = pc.id === activePcId;
    const isLocal = isLocalPC(pc);
    return (
      <button
        key={pc.id}
        role="option"
        aria-selected={isActive}
        disabled={!isOnline}
        onClick={() => handlePick(pc)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-mono transition-all
          ${isActive
            ? 'bg-navi/20 border-l-2 border-navi/60 text-navi-glow'
            : isOnline
              ? 'border-l-2 border-transparent text-txt-bright hover:bg-cyber-700/40'
              : 'border-l-2 border-transparent text-txt-muted/40 opacity-60 cursor-not-allowed pointer-events-none'}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-exe-green animate-pulse' : 'bg-alert-red/70'}`} />
        <span className="truncate flex-1">{pc.label || pc.id}</span>
        {isLocal && (
          <span className="text-[9px] text-exe-green/80 border border-exe-green/30 rounded px-1 flex-shrink-0">LOCAL</span>
        )}
      </button>
    );
  });

  // --- PC なし ---
  if (!loading && !authError && !networkError && pcs.length === 0) {
    return (
      <div className="relative">
        {triggerBtn}
        {isOpen && (mobile ? (
          createPortal(
            <>
              <div className="fixed inset-0 z-[9998] bg-black/40" onClick={() => setIsOpen(false)} />
              <div
                ref={dropdownRef}
                className="fixed bottom-0 left-0 right-0 z-[9999] h-[280px] bg-cyber-900/95 border-t border-navi/40 shadow-neon-cyan flex flex-col"
                role="listbox"
              >
                <div className="px-3 py-4 text-txt-muted text-xs">PCが登録されていません</div>
              </div>
            </>,
            document.body,
          )
        ) : (
          <div
            ref={dropdownRef}
            className="absolute right-0 mt-1 min-w-[220px] bg-cyber-900/95 border border-cyber-600/60 rounded shadow-xl z-50 py-1"
            role="listbox"
          >
            <div className="px-3 py-2 text-txt-muted text-xs">PCが登録されていません</div>
          </div>
        ))}
      </div>
    );
  }

  // --- 本体 ---
  const body = (
    <>
      {loading && <div className="px-3 py-2 text-txt-muted/70 text-xs animate-pulse">読み込み中...</div>}
      {authError && (
        <div className="px-3 py-2 space-y-1.5">
          <div className="text-txt-bright text-xs font-semibold">ログインの有効期限が切れました</div>
          <a
            href={`${DISPATCHER_URL}/api/auth/google`}
            className="inline-block text-[11px] font-mono px-2 py-1 border border-navi/50 text-navi-glow rounded hover:bg-navi/10"
          >
            Googleでログインする
          </a>
        </div>
      )}
      {networkError && (
        <div className="px-3 py-2 text-alert-red/80 text-xs">通信できませんでした</div>
      )}
      {!loading && !authError && !networkError && listItems}
    </>
  );

  return (
    <div className="relative">
      {triggerBtn}
      {isOpen && (mobile ? (
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998] bg-black/40" onClick={() => setIsOpen(false)} />
            <div
              ref={dropdownRef}
              className="fixed bottom-0 left-0 right-0 z-[9999] h-[280px] bg-cyber-900/95 border-t border-navi/40 shadow-neon-cyan flex flex-col overflow-y-auto"
              role="listbox"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-cyber-700/50 sticky top-0 bg-cyber-900/95">
                <span className="text-txt-bright font-mono text-xs">PCを選択</span>
                <button
                  type="button"
                  aria-label="閉じる"
                  onClick={() => setIsOpen(false)}
                  className="text-txt-muted hover:text-txt-bright text-sm leading-none px-1"
                >✕</button>
              </div>
              <div className="flex-1">{body}</div>
            </div>
          </>,
          document.body,
        )
      ) : (
        <div
          ref={dropdownRef}
          className="absolute right-0 mt-1 min-w-[220px] max-h-[360px] overflow-y-auto bg-cyber-900/95 border border-cyber-600/60 rounded shadow-xl z-50 py-1"
          role="listbox"
        >
          {body}
        </div>
      ))}
    </div>
  );
}
