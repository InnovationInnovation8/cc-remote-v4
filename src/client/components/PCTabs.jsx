// CC-Remote v4 — PCTabs
// Phase 2 で usePcList フックに PC 一覧管理ロジックを抽出。
// 本コンポーネントは UI（帯状タブ / 空状態 / エラー表示 / 長押しメニュー）のみ保持し、
// pcs/statuses/heartbeats/loading/authError/networkError は props で受け取る。
// 互換のためフック未配布の場合（props 未渡し）は従来通り自身で usePcList を呼ぶ。
import { useState, useRef, useCallback, useEffect } from 'react';
import { listPcs, removePc, renamePc } from '../utils/pcStore';
import { track } from '../utils/analytics';
import { usePcList } from '../hooks/usePcList';

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

/** last_heartbeat_at (ms) から現在時刻との差分を「X分前」文字列で返す */
function formatHeartbeatAge(lastHeartbeatAt) {
  if (!lastHeartbeatAt) return '';
  const diffMs = Date.now() - lastHeartbeatAt;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '1分以内';
  return `${diffMin}分前`;
}

export default function PCTabs({
  activePC,
  onSelectPC,
  onAddPC,
  className,
  // Phase 2: App.jsx が usePcList を呼び、ここに配布する。
  // 後方互換: 未渡し時は自分で usePcList を呼ぶ（既存呼び出し元を壊さない）。
  pcListState,
}) {
  const ownPcList = usePcList();
  const source = pcListState || ownPcList;
  const { pcs, statuses, heartbeats, loading, authError, networkError, handleManualRetry } = source;

  // ローカル UI state（メニュー系は PCTabs 固有）
  const [, setPcsLocal] = useState(() => pcs); // localStorage モードで rename/delete 後の再反映用プレースホルダ
  const [menuPcId, setMenuPcId] = useState(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const longPressTimer = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    return () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  }, []);

  useEffect(() => {
    if (!menuPcId) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuPcId(null);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [menuPcId]);

  const startLongPress = useCallback((e, pc) => {
    const rect = e.currentTarget.getBoundingClientRect();
    longPressTimer.current = setTimeout(() => {
      setMenuPcId(pc.id);
      const menuW = 140, menuH = 80;
      const x = Math.max(4, Math.min(rect.left, window.innerWidth - menuW - 4));
      const y = rect.bottom + 4 + menuH > window.innerHeight
        ? Math.max(4, rect.top - menuH - 4)
        : rect.bottom + 4;
      setMenuPos({ x, y });
    }, 500);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  const handleRename = useCallback((pcId) => {
    setMenuPcId(null);
    const newName = prompt('PC名を入力:');
    if (!newName || !newName.trim()) return;
    renamePc(pcId, newName.trim());
    // pcs-changed イベントで usePcList が listPcs を再ロードする（localStorage モード）
    window.dispatchEvent(new Event('cc-remote:pcs-changed'));
    setPcsLocal(listPcs());
  }, []);

  const handleDelete = useCallback((pcId) => {
    setMenuPcId(null);
    if (!confirm('このPCを削除しますか?')) return;
    removePc(pcId);
    window.dispatchEvent(new Event('cc-remote:pcs-changed'));
    setPcsLocal(listPcs());
  }, []);

  const containerCls = `flex gap-1 px-2 py-1 bg-cyber-900/80 border-b border-cyber-700/50 ${className || ''}`;

  // --- loading 表示（dispatcher モードのみ）---
  if (loading) {
    return (
      <div data-tutorial-id="pc-list" className={containerCls}>
        <span className="text-txt-muted/60 font-mono text-xs animate-pulse px-2 py-1.5">読み込み中...</span>
      </div>
    );
  }

  // --- 認証エラー（dispatcher モードのみ）---
  if (authError) {
    return (
      <div data-tutorial-id="pc-list" className={`px-3 py-3 bg-cyber-900/80 border-b border-cyber-700/50 ${className || ''}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-base">🔑</span>
          <span className="text-txt-bright font-mono text-sm font-semibold">ログインの有効期限が切れました</span>
        </div>
        <p className="text-txt-muted text-xs mb-2 leading-relaxed">
          30日経ったか、別の端末からログアウトされた可能性があります。
        </p>
        <a
          href={`${DISPATCHER_URL}/api/auth/google`}
          className="inline-block text-xs font-mono px-3 py-1.5 border border-navi/50 text-navi-glow rounded hover:bg-navi/10 transition-colors"
        >
          Googleでログインする
        </a>
      </div>
    );
  }

  // --- ネットワークエラー（dispatcher モードのみ）---
  if (networkError) {
    return (
      <div data-tutorial-id="pc-list" className={`px-3 py-3 bg-cyber-900/80 border-b border-cyber-700/50 ${className || ''}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-base">🔌</span>
          <span className="text-txt-bright font-mono text-sm font-semibold">サーバーと通信できませんでした</span>
        </div>
        <div className="text-txt-muted text-xs mb-2 leading-relaxed space-y-0.5">
          <div className="text-txt-muted/80">▼ こんな時になります</div>
          <div className="pl-3">・ネットが一時的に切れている</div>
          <div className="pl-3">・Wi-Fi が不安定</div>
          <div className="pl-3">・サーバー側が混雑/メンテ中（ごくまれ）</div>
          <div className="text-txt-muted/80 mt-1.5">▼ 試してみること</div>
          <div className="pl-3">1. ネット接続が繋がっているか確認</div>
          <div className="pl-3">2. 下のボタンを押す</div>
          <div className="pl-3">3. 直らなければ数分待って再度</div>
        </div>
        <button
          onClick={handleManualRetry}
          className="inline-block text-xs font-mono px-3 py-1.5 border border-navi/50 text-navi-glow rounded hover:bg-navi/10 transition-colors"
        >
          もう一度試す
        </button>
      </div>
    );
  }

  if (pcs.length === 0) {
    // Empty state
    if (DISPATCHER_MODE) {
      // dispatcher モード: 使い方ガイド
      return (
        <div data-tutorial-id="pc-list" className={`px-3 py-3 bg-cyber-900/80 border-b border-cyber-700/50 ${className || ''}`}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-base">💻</span>
            <span className="text-txt-bright font-mono text-sm font-semibold">操作できるPCがまだありません</span>
          </div>
          <div className="text-txt-muted text-xs mb-2 leading-relaxed space-y-0.5">
            <div className="text-txt-muted/80">▼ 使うには</div>
            <div className="pl-3">1. 操作したいPC（家や会社）でCC-Remoteアプリを起動</div>
            <div className="pl-3">2. そのPCが自動で登録されるまで数秒待つ</div>
            <div className="pl-3">3. ここに現れたら、選んで操作開始</div>
            <div className="text-txt-muted/80 mt-1.5">▼ 自動で出ない時</div>
            <div className="pl-3">・操作したいPCでCC-Remoteが起動しているか確認</div>
            <div className="pl-3">・PC側で Google ログインが済んでいるか確認</div>
          </div>
          <button
            onClick={handleManualRetry}
            className="inline-block text-xs font-mono px-3 py-1.5 border border-navi/50 text-navi-glow rounded hover:bg-navi/10 transition-colors"
          >
            もう一度読み込む
          </button>
        </div>
      );
    }
    // localStorage モード: PC追加ボタン
    return (
      <div data-tutorial-id="pc-list" className={containerCls}>
        {onAddPC && (
          <button
            onClick={onAddPC}
            className="flex items-center gap-1 px-3 py-1.5 rounded border border-cyber-600/40 text-txt-muted/70 font-mono text-xs hover:border-navi/50 hover:text-navi-glow"
          >
            <span className="text-base leading-none">+</span>
            <span>PCを追加</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div data-tutorial-id="pc-list" className={`relative flex gap-1 px-2 py-1 bg-cyber-900/80 border-b border-cyber-700/50 overflow-x-auto scrollbar-hide ${className || ''}`}>
      {pcs.map(pc => {
        const isActive = activePC === pc.id;
        const status = statuses[pc.id];
        const isOnline = status === 'online';
        const isLocal = isLocalPC(pc);
        const lastBeat = heartbeats[pc.id];
        return (
          <button
            key={pc.id}
            onClick={() => {
              if (!isOnline) {
                track('pc_select_blocked_offline');
                return;
              }
              track('pc_selected', { is_local: isLocal, dispatcher_mode: DISPATCHER_MODE });
              onSelectPC(pc.id, pc.url, pc.label);
            }}
            onPointerDown={(e) => startLongPress(e, pc)}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onContextMenu={(e) => e.preventDefault()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono whitespace-nowrap transition-all
              ${isActive
                ? 'bg-navi/20 border border-navi/50 text-navi-glow shadow-neon-cyan'
                : isOnline
                  ? 'border border-cyber-600/50 text-txt-muted hover:bg-cyber-700/30 hover:text-txt-bright'
                  : 'border border-cyber-700/30 text-txt-muted/40 opacity-60 cursor-not-allowed'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-exe-green animate-pulse' : 'bg-alert-red/70'}`} />
            <span className="truncate max-w-[120px]">{pc.label}</span>
            {isLocal && (
              <span className="text-[9px] text-exe-green/80 border border-exe-green/30 rounded px-1 flex-shrink-0">LOCAL</span>
            )}
            {!isOnline && !isLocal && DISPATCHER_MODE && lastBeat && (
              <span className="text-[9px] text-txt-muted/50 flex-shrink-0">
                {formatHeartbeatAge(lastBeat)}
              </span>
            )}
          </button>
        );
      })}
      {onAddPC && !DISPATCHER_MODE && (
        <button
          onClick={onAddPC}
          className="flex items-center justify-center w-7 h-7 my-auto rounded border border-cyber-600/40 text-txt-muted/50 hover:border-navi/50 hover:text-navi-glow transition-all flex-shrink-0 text-base leading-none"
          title="PCを追加"
        >+</button>
      )}

      {menuPcId && !DISPATCHER_MODE && (
        <div
          ref={menuRef}
          style={{ left: menuPos.x, top: menuPos.y }}
          className="fixed z-50 min-w-[120px] bg-cyber-800 border border-cyber-600/70 rounded shadow-lg py-1"
        >
          <button
            onClick={() => handleRename(menuPcId)}
            className="w-full text-left px-3 py-1.5 text-xs text-txt-bright hover:bg-cyber-700/50"
          >名前変更</button>
          <button
            onClick={() => handleDelete(menuPcId)}
            className="w-full text-left px-3 py-1.5 text-xs text-alert-red hover:bg-cyber-700/50"
          >削除</button>
        </div>
      )}
    </div>
  );
}
