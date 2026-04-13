// CC-Remote v4 — PCTabs (localStorage-backed, no central registry, no Firestore)
import { useState, useRef, useCallback, useEffect } from 'react';
import { listPcs, removePc, renamePc, pingPc } from '../utils/pcStore';

function isLocalPC(pc) {
  if (!pc.url) return true;
  try {
    return new URL(pc.url).origin === window.location.origin;
  } catch {
    return false;
  }
}

export default function PCTabs({ activePC, onSelectPC, onAddPC }) {
  const [pcs, setPcs] = useState(() => listPcs());
  const [statuses, setStatuses] = useState({}); // pcId -> 'online' | 'offline'
  const [menuPcId, setMenuPcId] = useState(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const longPressTimer = useRef(null);
  const menuRef = useRef(null);

  // Listen for localStorage changes (cross-tab) and re-load
  useEffect(() => {
    const reload = () => setPcs(listPcs());
    window.addEventListener('storage', reload);
    window.addEventListener('cc-remote:pcs-changed', reload);
    return () => {
      window.removeEventListener('storage', reload);
      window.removeEventListener('cc-remote:pcs-changed', reload);
    };
  }, []);

  // Periodic health ping for each PC
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const next = {};
      await Promise.all(pcs.map(async (pc) => {
        if (isLocalPC(pc)) { next[pc.id] = 'online'; return; }
        const ok = await pingPc(pc.url);
        next[pc.id] = ok ? 'online' : 'offline';
      }));
      if (!cancelled) setStatuses(next);
    };
    check();
    const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pcs]);

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
    setPcs(listPcs());
  }, []);

  const handleDelete = useCallback((pcId) => {
    setMenuPcId(null);
    if (!confirm('このPCを削除しますか?')) return;
    removePc(pcId);
    setPcs(listPcs());
  }, []);

  if (pcs.length === 0) {
    // Empty state with add button
    return (
      <div data-tutorial-id="pc-list" className="flex gap-1 px-2 py-1 bg-cyber-900/80 border-b border-cyber-700/50">
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
    <div data-tutorial-id="pc-list" className="relative flex gap-1 px-2 py-1 bg-cyber-900/80 border-b border-cyber-700/50 overflow-x-auto scrollbar-hide">
      {pcs.map(pc => {
        const isActive = activePC === pc.id;
        const status = statuses[pc.id];
        const isOnline = status === 'online';
        const isLocal = isLocalPC(pc);
        return (
          <button
            key={pc.id}
            onClick={() => isOnline && onSelectPC(pc.id, pc.url)}
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
          </button>
        );
      })}
      {onAddPC && (
        <button
          onClick={onAddPC}
          className="flex items-center justify-center w-7 h-7 my-auto rounded border border-cyber-600/40 text-txt-muted/50 hover:border-navi/50 hover:text-navi-glow transition-all flex-shrink-0 text-base leading-none"
          title="PCを追加"
        >+</button>
      )}

      {menuPcId && (
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
