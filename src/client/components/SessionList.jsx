import { useState, useEffect } from 'react';
import { useSession } from '../hooks/useSession';
import { getApiBase, getAuthHeaders } from '../utils/api';

export default function SessionList({ activeSession, onSelect, token, onClose }) {
  const { sessions, createSession, deleteSession, renameSession, setMemo, togglePin, toggleArchive, setApprovalLevel, setTags, listClaudeSessions, resumeClaudeSession, sendInput, handoffSession } = useSession(token);
  const [editTagId, setEditTagId] = useState(null);
  const [editTagText, setEditTagText] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editMemoId, setEditMemoId] = useState(null);
  const [editMemoText, setEditMemoText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [shareToast, setShareToast] = useState('');
  const [claudeSessions, setClaudeSessions] = useState([]);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [tab, setTab] = useState('active'); // 'active' | 'resume'
  const [shareMenuId, setShareMenuId] = useState(null);

  // RESUME タブ開いたら自動でClaude セッション取得
  useEffect(() => {
    if (tab === 'resume' && claudeSessions.length === 0) {
      setResumeLoading(true);
      (async () => {
        try {
          const list = await listClaudeSessions();
          setClaudeSessions(list || []);
        } catch (e) {} finally { setResumeLoading(false); }
      })();
    }
  }, [tab]);

  const handleCreate = async () => {
    const session = await createSession();
    onSelect(session.id);
    onClose();
  };

  const handleSelect = (id) => {
    onSelect(id);
    onClose();
  };

  const handleRename = async (id) => {
    if (editName.trim()) await renameSession(id, editName.trim());
    setEditingId(null);
  };

  const handleMemoSave = async (id) => {
    await setMemo(id, editMemoText);
    setEditMemoId(null);
  };

  const handleDelete = async (id) => {
    await deleteSession(id);
    setDeleteTarget(null);
    if (activeSession === id) onSelect(null);
  };

  const handleShareDirect = async (s) => {
    setShareMenuId(null);
    try {
      const res = await fetch(`${getApiBase()}/sessions/${s.id}/export`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('export failed');
      const { text, name } = await res.json();

      if (navigator.share) {
        await navigator.share({ title: name, text });
      } else {
        await navigator.clipboard.writeText(text);
        setShareToast('コピーしました');
        setTimeout(() => setShareToast(''), 2000);
      }
    } catch (e) {
      console.error('Share failed:', e);
    }
  };

  const handleShareSummarize = async (s) => {
    setShareMenuId(null);
    try {
      await sendInput(s.id, 'このセッションの作業内容を3行で要約してください');
      setShareToast('要約リクエスト送信しました');
      setTimeout(() => setShareToast(''), 2000);
    } catch (e) {
      console.error('Summarize failed:', e);
    }
  };

  const handleHandoff = async (s) => {
    setShareMenuId(null);
    try {
      const newSession = await handoffSession(s.id);
      onSelect(newSession.id);
      onClose();
    } catch (e) {
      console.error('Handoff failed:', e);
    }
  };

  const handleResume = async (claudeSession) => {
    try {
      const projectName = claudeSession.project ? claudeSession.project.split(/[/\\]/).pop() : '';
      const name = projectName || `Resume: ${claudeSession.sessionId.slice(0, 8)}`;
      // Rev 5 REV5-001: 元の project path を渡して claude --resume が正しい context で動くようにする
      const session = await resumeClaudeSession(claudeSession.sessionId, name, claudeSession.project);
      onSelect(session.id);
      onClose();
    } catch (e) {
      console.error('Resume failed:', e);
      alert('セッション再開に失敗しました: ' + (e?.message || e));
    }
  };

  return (
    <div className="fixed inset-0 bg-cyber-bg/90 z-50 flex flex-col" onClick={() => setShareMenuId(null)}>
      {/* Header */}
      <div className="bg-gradient-to-r from-cyber-800 to-cyber-900 border-b-2 border-navi px-3 py-2 flex items-center justify-between flex-shrink-0">
        <div className="text-navi-glow font-pixel text-[10px] tracking-wider">SESSIONS</div>
        <button onClick={onClose} className="chip-btn text-[10px] px-2.5 py-1 min-h-0">CLOSE</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-navi/20 flex-shrink-0">
        <button
          onClick={() => setTab('active')}
          className={`flex-1 py-2 text-[10px] font-mono tracking-wider transition-all
            ${tab === 'active' ? 'text-navi-glow border-b-2 border-navi-glow' : 'text-txt-muted'}`}
        >
          ACTIVE
        </button>
        <button
          onClick={() => setTab('resume')}
          className={`flex-1 py-2 text-[10px] font-mono tracking-wider transition-all
            ${tab === 'resume' ? 'text-exe-green border-b-2 border-exe-green' : 'text-txt-muted'}`}
        >
          引き継ぎ
        </button>
      </div>

      {/* Active sessions tab */}
      {tab === 'active' && (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* アーカイブ切り替え */}
            <div className="flex justify-end mb-1">
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="text-[9px] text-txt-muted font-mono hover:text-navi-glow"
              >
                {showArchived ? 'ACTIVE' : 'ARCHIVED'} ({sessions.filter(s => showArchived ? s.archived : !s.archived).length})
              </button>
            </div>

            {sessions.filter(s => showArchived ? s.archived : !s.archived).length === 0 && (
              <div className="text-center text-txt-muted font-mono text-xs py-8">
                // NO SESSIONS
              </div>
            )}

            {sessions
              .filter(s => showArchived ? s.archived : !s.archived)
              .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
              .map(s => {
              const preview = s.previewLine || '';
              const isActive = s.id === activeSession;

              return (
                <div
                  key={s.id}
                  className={`pet-frame p-3 transition-all ${isActive ? 'border-navi-glow shadow-neon-cyan' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
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
                        className="flex-1 bg-transparent border border-navi/50 rounded px-2 py-0.5 text-xs font-mono text-navi-glow outline-none"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="flex-1 text-xs font-mono text-txt-secondary truncate cursor-pointer"
                        onClick={() => handleSelect(s.id)}
                      >
                        {s.name}
                      </span>
                    )}

                    <button
                      onClick={() => togglePin(s.id)}
                      className={`text-[9px] px-1 ${s.pinned ? 'text-exe-yellow' : 'text-txt-muted hover:text-exe-yellow'}`}
                    >
                      {s.pinned ? 'UNPIN' : 'PIN'}
                    </button>
                    <button
                      onClick={() => { setEditingId(s.id); setEditName(s.name); }}
                      className="text-[9px] text-txt-muted hover:text-navi-glow px-1"
                    >
                      RENAME
                    </button>
                    <button
                      onClick={() => toggleArchive(s.id)}
                      className="text-[9px] text-txt-muted hover:text-navi-glow px-1"
                    >
                      {s.archived ? 'RESTORE' : 'ARCHIVE'}
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setShareMenuId(shareMenuId === s.id ? null : s.id)}
                        className="text-[9px] text-txt-muted hover:text-navi-glow px-1"
                      >
                        SHARE
                      </button>
                      {shareMenuId === s.id && (
                        <div
                          className="absolute right-0 top-full mt-0.5 z-[70] bg-cyber-900 border border-navi/40 rounded shadow-lg flex flex-col min-w-[120px]"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleShareSummarize(s)}
                            className="text-left px-3 py-1.5 text-[10px] font-mono text-txt-secondary hover:text-navi-glow hover:bg-navi/10 whitespace-nowrap"
                          >
                            要約して共有
                          </button>
                          <button
                            onClick={() => handleShareDirect(s)}
                            className="text-left px-3 py-1.5 text-[10px] font-mono text-txt-secondary hover:text-navi-glow hover:bg-navi/10 whitespace-nowrap"
                          >
                            そのまま共有
                          </button>
                          <button
                            onClick={() => handleHandoff(s)}
                            className="text-left px-3 py-1.5 text-[10px] font-mono text-txt-secondary hover:text-exe-green hover:bg-exe-green/10 whitespace-nowrap"
                          >
                            引き継ぎ
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setDeleteTarget(s.id)}
                      className="text-[9px] text-txt-muted hover:text-alert-red px-1"
                    >
                      DEL
                    </button>
                  </div>

                  {preview && (
                    <div className="text-[10px] text-txt-muted/60 font-mono truncate pl-4 cursor-pointer" onClick={() => handleSelect(s.id)}>
                      {preview}
                    </div>
                  )}

                  {/* メモ */}
                  {editMemoId === s.id ? (
                    <div className="pl-4 mt-1 flex gap-1">
                      <input
                        value={editMemoText}
                        onChange={e => setEditMemoText(e.target.value)}
                        onBlur={() => handleMemoSave(s.id)}
                        onKeyDown={e => e.key === 'Enter' && handleMemoSave(s.id)}
                        placeholder="メモ..."
                        className="flex-1 bg-transparent border border-navi/30 rounded px-2 py-0.5 text-[10px] font-mono text-txt-secondary outline-none"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div
                      className="text-[10px] text-txt-muted/50 font-mono pl-4 mt-0.5 cursor-pointer hover:text-txt-muted"
                      onClick={() => { setEditMemoId(s.id); setEditMemoText(s.memo || ''); }}
                    >
                      {s.memo || '+ メモ'}
                    </div>
                  )}

                  {/* タグ */}
                  <div className="pl-4 mt-0.5 flex items-center gap-1 flex-wrap">
                    {(s.tags || '').split(',').filter(Boolean).map((tag, ti) => (
                      <span key={ti} className="text-[9px] bg-navi/10 text-navi/70 border border-navi/20 rounded px-1">{tag.trim()}</span>
                    ))}
                    {editTagId === s.id ? (
                      <input
                        value={editTagText}
                        onChange={e => setEditTagText(e.target.value)}
                        onBlur={() => { setTags(s.id, editTagText); setEditTagId(null); }}
                        onKeyDown={e => e.key === 'Enter' && (setTags(s.id, editTagText), setEditTagId(null))}
                        placeholder="tag1, tag2..."
                        className="bg-transparent border border-navi/30 rounded px-1 py-0 text-[9px] font-mono text-txt-secondary outline-none w-24"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => { setEditTagId(s.id); setEditTagText(s.tags || ''); }}
                        className="text-[9px] text-txt-muted/30 hover:text-navi"
                      >
                        +tag
                      </button>
                    )}
                  </div>

                  <div className="text-[9px] text-txt-muted/40 font-mono pl-4 mt-0.5 flex items-center gap-2">
                    <span>
                      {s.pinned ? '* ' : ''}
                      {s.status === 'exited' ? 'ENDED' : s.status || 'RUNNING'}
                      {isActive && ' // ACTIVE'}
                    </span>
                    {/* 承認レベル */}
                    <select
                      value={s.approvalLevel || 'easy'}
                      onChange={e => { e.stopPropagation(); setApprovalLevel(s.id, e.target.value); }}
                      onClick={e => e.stopPropagation()}
                      className="bg-transparent border border-cyber-700 rounded text-[9px] px-1 py-0 text-txt-muted"
                    >
                      <option value="easy">EASY</option>
                      <option value="normal">NORMAL</option>
                      <option value="hard">HARD</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          {sessions.length < 5 && (
            <div className="p-3 border-t border-navi/20 flex-shrink-0">
              <button
                data-tutorial-id="new-session-btn"
                onClick={handleCreate}
                className="neon-btn w-full py-2.5 rounded text-xs font-pixel tracking-wider text-txt-bright"
              >
                + NEW SESSION
              </button>
            </div>
          )}
        </>
      )}

      {/* Resume tab */}
      {tab === 'resume' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {resumeLoading ? (
            <div className="text-center text-txt-muted font-mono text-xs py-8 animate-pulse">LOADING...</div>
          ) : claudeSessions.length === 0 ? (
            <div className="text-center text-txt-muted font-mono text-xs py-8">// NO SESSIONS TO RESUME</div>
          ) : (
            claudeSessions.map(cs => {
              const date = new Date(cs.timestamp);
              const timeStr = `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`;
              const projectName = cs.project ? cs.project.split(/[/\\]/).pop() : '';
              return (
                <button
                  key={cs.sessionId}
                  onClick={() => handleResume(cs)}
                  className="w-full text-left p-2.5 rounded border border-cyber-700 hover:border-exe-green/40 hover:bg-exe-green/5 transition-all"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-txt-secondary text-xs font-mono truncate max-w-[60%]">{projectName || 'unknown'}</span>
                    <span className="text-txt-muted text-[10px]">{timeStr}</span>
                  </div>
                  <div className="text-txt-muted text-[10px] truncate mb-0.5">{cs.display || cs.sessionId.slice(0, 12)}</div>
                  <div className="flex items-center gap-1.5 text-[9px] text-txt-muted/60">
                    {cs.messageCount > 0 && <span>{cs.messageCount}件</span>}
                    {cs.isActive && (
                      <span className="text-exe-green border border-exe-green/30 rounded px-1">ACTIVE</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Share toast */}
      {shareToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-cyber-800 border border-navi/40 text-navi-glow text-[10px] font-mono px-4 py-2 rounded z-[70]">
          {shareToast}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-cyber-bg/80 z-[60] flex items-center justify-center" onClick={() => setDeleteTarget(null)}>
          <div className="pet-frame p-4 text-center mx-4" onClick={e => e.stopPropagation()}>
            <div className="text-txt-secondary text-xs font-mono mb-3">DELETE SESSION?</div>
            <div className="flex gap-2 justify-center">
              <button onClick={() => handleDelete(deleteTarget)}
                className="chip-btn border-alert-red/50 text-alert-red text-[10px] px-4 py-1.5">DELETE</button>
              <button onClick={() => setDeleteTarget(null)}
                className="chip-btn text-[10px] px-4 py-1.5">CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
