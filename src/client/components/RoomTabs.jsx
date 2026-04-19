// CC-Remote v2 UI — RoomTabs (Phase 3 Step 3-2)
//
// ヘッダー直下の横スクロール型セッションタブ。SessionBar.jsx の代替。
//
// props:
//   sessions: {id, name, status}[]  — サーバー /sessions レスポンス（App.jsx の useSession 由来）
//   activeSessionId: string | null
//   unreadCounts: Record<sessionId, number>  — 省略可。App.jsx の /notifications/unread を per-session に
//                                              ブレイクダウンできない現行仕様では空 {} で OK。
//   onSelect: (sessionId) => void
//   onAdd: () => void                — 新規セッション作成（createSession）
//   onClose: (sessionId) => void     — セッション削除（deleteSession）
//   pcId: string                     — IDB キー `ccr-tabs-{pcId}` のスコープ
//
// IDB 永続化 `ccr-tabs-{pcId}`: { order: string[], activeId: string|null }
//   - order = タブに表示する session id の並び（ghost 含む）
//   - activeId = 再読込時に復元したい active id（App.jsx が参照しない場合は単なるログ）
//
// Reconciliation（plan L100-L132, BLOCKER-1）:
//   - マウント時 + sessions/pcId 変更時に order を再計算
//   - sessions にあるが order にない ID → 末尾追加（新規セッション）→ idbSet
//   - order にあるが sessions にない ID → ghost として残す（自動で消さない。ユーザーの ✕ で除去）

import { useEffect, useRef, useState } from 'react';
import { idbGet, idbSet } from '../utils/idbStore';

export default function RoomTabs({
  sessions = [],
  activeSessionId = null,
  unreadCounts = {},
  onSelect,
  onAdd,
  onClose,
  pcId = '',
}) {
  // order: IDB から復元。null = まだ読み込み中（sessions があっても reconciliation を走らせない）
  const [order, setOrder] = useState(null);
  const loadedPcIdRef = useRef(null);

  // pcId 変更時: IDB 読込 → setOrder
  useEffect(() => {
    let cancelled = false;
    if (!pcId) {
      setOrder([]);
      loadedPcIdRef.current = '';
      return undefined;
    }
    (async () => {
      const stored = await idbGet(`ccr-tabs-${pcId}`, null);
      if (cancelled) return;
      const initial = Array.isArray(stored?.order) ? stored.order : [];
      setOrder(initial);
      loadedPcIdRef.current = pcId;
    })();
    return () => { cancelled = true; };
  }, [pcId]);

  // Reconciliation: sessions が更新されるたびに order と突合
  useEffect(() => {
    if (order === null) return; // まだ IDB load 中
    if (loadedPcIdRef.current !== pcId) return; // pcId 切替直後の 1 tick は待つ

    const sessionIds = new Set(sessions.map((s) => s.id));
    const orderSet = new Set(order);

    // sessions に存在するが order にない → 末尾追加（新規セッション）
    const appended = [];
    for (const s of sessions) {
      if (!orderSet.has(s.id)) appended.push(s.id);
    }

    if (appended.length === 0) return; // 変更なし
    const nextOrder = [...order, ...appended];
    setOrder(nextOrder);
    idbSet(`ccr-tabs-${pcId}`, { order: nextOrder, activeId: activeSessionId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, pcId]);

  // active 変更時に IDB を更新（order は変えない）
  useEffect(() => {
    if (order === null) return;
    if (!pcId) return;
    idbSet(`ccr-tabs-${pcId}`, { order, activeId: activeSessionId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const handleCloseClick = (e, sessionId, isGhost) => {
    e.stopPropagation();
    if (isGhost) {
      // ghost タブ: IDB から order を除去するだけ（サーバー API 呼ばない）
      const nextOrder = order.filter((id) => id !== sessionId);
      setOrder(nextOrder);
      idbSet(`ccr-tabs-${pcId}`, { order: nextOrder, activeId: activeSessionId });
      return;
    }
    // 実在セッション: deleteSession → order からも除去
    const nextOrder = order.filter((id) => id !== sessionId);
    setOrder(nextOrder);
    idbSet(`ccr-tabs-${pcId}`, { order: nextOrder, activeId: activeSessionId });
    if (onClose) onClose(sessionId);
  };

  if (order === null) {
    return (
      <div className="bg-cyber-900 border-b border-navi/20 h-9 flex items-center px-2 flex-shrink-0">
        <span className="text-txt-muted text-[10px] font-mono animate-pulse">LOADING TABS...</span>
      </div>
    );
  }

  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  return (
    <div
      className="bg-cyber-900 border-b border-navi/30 h-9 flex items-center gap-1 px-2 overflow-x-auto flex-shrink-0"
      style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      data-tutorial-id="room-tabs"
    >
      <style>{`
        [data-tutorial-id="room-tabs"]::-webkit-scrollbar { display: none; }
      `}</style>

      {order.map((sid) => {
        const s = sessionMap.get(sid);
        const isGhost = !s;
        const isActive = sid === activeSessionId;
        const name = s?.name || '不明なセッション';
        const unread = unreadCounts[sid] || 0;

        return (
          <button
            key={sid}
            type="button"
            data-ghost={isGhost ? 'true' : undefined}
            onClick={() => {
              if (isGhost) {
                alert('このセッションはすでに終了しています');
                return;
              }
              if (onSelect) onSelect(sid);
            }}
            className={`flex items-center gap-1.5 h-7 px-2.5 rounded-t text-[11px] font-mono whitespace-nowrap flex-shrink-0 border-b-2 transition-all duration-150 select-none
              ${isGhost
                ? 'opacity-40 cursor-not-allowed border-transparent text-txt-muted'
                : isActive
                  ? 'border-navi text-navi-glow bg-navi/10'
                  : 'border-transparent text-txt-muted hover:text-txt-secondary hover:border-cyber-500'
              }`}
          >
            {/* Session status dot (ghost は表示しない) */}
            {!isGhost && (
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                s.status === 'running' || s.status === '起動中...'
                  ? 'bg-exe-green shadow-[0_0_4px_rgba(0,255,65,0.5)]'
                  : s.status === 'exited'
                    ? 'bg-alert-red'
                    : 'bg-txt-muted'
              }`} />
            )}
            <span className="truncate max-w-[110px]">{name}</span>
            {unread > 0 && (
              <span className="ml-1 min-w-[14px] h-[14px] px-1 bg-alert-red text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
            <span
              role="button"
              aria-label="タブを閉じる"
              onClick={(e) => handleCloseClick(e, sid, isGhost)}
              className={`ml-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] leading-none hover:bg-cyber-700/60 ${isGhost ? 'pointer-events-auto' : ''}`}
              style={{ cursor: 'pointer' }}
            >×</span>
          </button>
        );
      })}

      {/* + 新規セッション */}
      <button
        type="button"
        onClick={onAdd}
        aria-label="新しいセッションを追加"
        title="新しいセッション"
        className="h-7 w-7 rounded border border-navi/40 text-navi-glow flex items-center justify-center flex-shrink-0 text-sm font-mono hover:bg-navi/10 hover:border-navi transition-all"
      >+</button>

      {/* 空状態 */}
      {order.length === 0 && (
        <span className="ml-2 text-txt-muted text-[10px] font-mono">SESSIONS: 0</span>
      )}
    </div>
  );
}
