import { useState, useRef, useEffect } from 'react';
import { useSession } from '../hooks/useSession';

export default function SessionBar({ activeSession, onSelect, token, onShowList }) {
  const { sessions, fetchSessions, createSession, deleteSession, renameSession, listClaudeSessions, resumeClaudeSession } = useSession(token);

  // 5秒ごとにセッション一覧更新
  useEffect(() => {
    const timer = setInterval(fetchSessions, 5000);
    return () => clearInterval(timer);
  }, [fetchSessions]);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showResume, setShowResume] = useState(false);
  const [claudeSessions, setClaudeSessions] = useState([]);
  const [resumeLoading, setResumeLoading] = useState(false);
  const longPressRef = useRef(null);
  // Rev 5 REV5-003: 長押しで出すコンテキストメニュー (リネーム / 閉じる)
  const [contextMenu, setContextMenu] = useState(null); // { sessionId, x, y } | null
  const contextMenuRef = useRef(null);

  const handleCreate = async () => {
    const session = await createSession();
    onSelect(session.id);
  };

  const handleShowResume = async () => {
    setResumeLoading(true);
    try {
      const list = await listClaudeSessions();
      setClaudeSessions(list);
      setShowResume(true);
    } catch (e) {
      console.error('Claude sessions fetch failed:', e);
    } finally {
      setResumeLoading(false);
    }
  };

  const handleResume = async (claudeSession) => {
    try {
      const projectName = claudeSession.project ? claudeSession.project.split(/[/\\]/).pop() : '';
      const name = projectName || `Resume: ${claudeSession.sessionId.slice(0, 8)}`;
      // Rev 5 REV5-001: 元の project path を渡して claude --resume が正しい context で動くようにする
      const session = await resumeClaudeSession(claudeSession.sessionId, name, claudeSession.project);
      setShowResume(false);
      onSelect(session.id);
    } catch (e) {
      console.error('Resume failed:', e);
      alert('セッション再開に失敗しました: ' + (e?.message || e));
    }
  };

  const handleRename = async (id) => {
    if (editName.trim()) await renameSession(id, editName.trim());
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    await deleteSession(id);
    setConfirmDeleteId(null);
    if (activeSession === id) onSelect(null);
  };

  // Rev 5 REV5-003: 長押しで削除ダイアログではなくコンテキストメニュー (リネーム / 閉じる) を表示。
  const startLongPress = (e, id) => {
    const rect = e.currentTarget.getBoundingClientRect();
    longPressRef.current = setTimeout(() => {
      // メニュー位置: タブの下端を基準、画面外に出ないよう clamp
      const menuW = 140;
      const menuH = 80;
      let x = rect.left;
      let y = rect.bottom + 4;
      if (x + menuW > window.innerWidth - 4) x = window.innerWidth - menuW - 4;
      if (y + menuH > window.innerHeight - 4) y = rect.top - menuH - 4;
      if (x < 4) x = 4;
      if (y < 4) y = 4;
      setContextMenu({ sessionId: id, x, y });
    }, 600);
  };

  const cancelLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [contextMenu]);

  const handleMenuRename = (id) => {
    const s = sessions.find(x => x.id === id);
    if (s) {
      setEditingId(id);
      setEditName(s.name || '');
    }
    setContextMenu(null);
  };

  const handleMenuDelete = (id) => {
    setContextMenu(null);
    setConfirmDeleteId(id);
  };

  return (
    <>
      <div className="bg-cyber-900 border-b border-navi/30 flex items-center gap-1 px-2 py-1 overflow-x-auto flex-shrink-0"
        style={{ WebkitOverflowScrolling: 'touch' }}>

        {sessions.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            onDoubleClick={() => { setEditingId(s.id); setEditName(s.name); }}
            onTouchStart={(e) => startLongPress(e, s.id)}
            onTouchEnd={cancelLongPress}
            onTouchMove={cancelLongPress}
            onMouseDown={(e) => startLongPress(e, s.id)}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onContextMenu={(e) => e.preventDefault()}
            style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono whitespace-nowrap flex-shrink-0 border transition-all duration-150 select-none
              ${s.id === activeSession
                ? 'bg-navi/15 border-navi-glow/50 text-navi-glow shadow-[0_0_6px_rgba(0,232,216,0.15)]'
                : 'bg-transparent border-cyber-600 text-txt-muted hover:text-txt-secondary hover:border-cyber-400'
              }`}
          >
            {/* Status indicator */}
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              s.status === 'running' || s.status === '起動中...'
                ? 'bg-exe-green shadow-[0_0_4px_rgba(0,255,65,0.5)]'
                : s.status === 'exited'
                  ? 'bg-alert-red'
                  : 'bg-txt-muted'
            }`} />

            {editingId === s.id ? (
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => handleRename(s.id)}
                onKeyDown={e => e.key === 'Enter' && handleRename(s.id)}
                className="bg-transparent border-none outline-none text-[11px] w-16 text-navi-glow"
                autoFocus
              />
            ) : (
              <span className="truncate max-w-[70px]">{s.name}</span>
            )}
          </button>
        ))}

        {/* Session管理ボタン（一覧 + 新規 + RESUME 全部入り） */}
        <button
          data-tutorial-id="session-btn"
          onClick={onShowList}
          className="h-7 px-2 rounded border border-orange-400/50 text-orange-400/80 hover:bg-orange-400/10 hover:text-orange-300 hover:border-orange-400/70 flex items-center justify-center flex-shrink-0 text-[10px] font-mono transition-all"
        >
          AllSession
        </button>
      </div>

      {/* Rev 5 REV5-003: 長押しコンテキストメニュー (リネーム / 閉じる) */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 min-w-[140px] bg-cyber-800 border border-navi/50 rounded shadow-lg py-1 animate-fade-in"
        >
          <button
            onClick={() => handleMenuRename(contextMenu.sessionId)}
            className="w-full text-left px-3 py-2 text-xs font-mono text-txt-bright hover:bg-navi/15 transition-colors"
          >
            リネーム
          </button>
          <button
            onClick={() => handleMenuDelete(contextMenu.sessionId)}
            className="w-full text-left px-3 py-2 text-xs font-mono text-alert-red hover:bg-alert-red/15 transition-colors"
          >
            閉じる
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in"
          onClick={() => setConfirmDeleteId(null)}>
          <div className="pet-frame p-5 mx-4 max-w-xs w-full text-center" onClick={e => e.stopPropagation()}>
            <div className="text-alert-red font-pixel text-[11px] mb-3 tracking-wider">SESSION DELETE</div>
            <div className="text-txt-secondary text-sm mb-4">このセッションを閉じますか？</div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded border border-cyber-500 text-txt-muted text-xs font-mono hover:border-navi-glow hover:text-navi-glow transition-all"
              >
                CANCEL
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="px-4 py-2 rounded bg-alert-red/20 border border-alert-red/50 text-alert-red text-xs font-mono hover:bg-alert-red/30 transition-all"
              >
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resume Claude session modal */}
      {showResume && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 animate-fade-in"
          onClick={() => setShowResume(false)}>
          <div className="pet-frame w-full max-w-md max-h-[70vh] flex flex-col mb-0 rounded-b-none"
            onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-navi/20 flex items-center justify-between">
              <div className="text-navi-glow font-pixel text-[11px] tracking-wider">引き継ぎ</div>
              <button onClick={() => setShowResume(false)} className="text-txt-muted hover:text-txt-secondary text-lg">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {claudeSessions.length === 0 ? (
                <div className="text-txt-muted text-sm text-center py-8">セッション履歴がありません</div>
              ) : (
                claudeSessions.map(cs => {
                  const date = new Date(cs.timestamp);
                  const timeStr = `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`;
                  const projectName = cs.project ? cs.project.split(/[/\\]/).pop() : '—';
                  return (
                    <button
                      key={cs.sessionId}
                      onClick={() => handleResume(cs)}
                      className="w-full text-left p-2.5 rounded border border-cyber-700 hover:border-navi-glow/40 hover:bg-navi/5 mb-1.5 transition-all"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-txt-secondary text-xs font-mono truncate max-w-[60%]">{projectName}</span>
                        <span className="text-txt-muted text-[10px]">{timeStr}</span>
                      </div>
                      <div className="text-txt-muted text-[10px] truncate">{cs.display || cs.sessionId.slice(0, 12)}</div>
                      {cs.isActive && (
                        <span className="inline-block mt-1 text-[9px] text-exe-green border border-exe-green/30 rounded px-1">ACTIVE</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
