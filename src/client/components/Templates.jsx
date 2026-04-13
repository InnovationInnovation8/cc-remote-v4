import { useState, useEffect } from 'react';
import { getApiBase, getAuthHeaders } from '../utils/api';

export default function Templates({ token, onExecute, onClose, sessions = [] }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newCategory, setNewCategory] = useState('');

  // Schedule state
  const [schedules, setSchedules] = useState([]);
  const [schedHour, setSchedHour] = useState('09');
  const [schedMinute, setSchedMinute] = useState('00');
  const [schedRepeat, setSchedRepeat] = useState('daily');
  const [schedSessionId, setSchedSessionId] = useState('');
  const [schedPrompt, setSchedPrompt] = useState('');
  const [schedError, setSchedError] = useState('');

  const [sessionList, setSessionList] = useState(sessions);

  useEffect(() => {
    fetchTemplates(); fetchSchedules();
    // セッション一覧を取得
    if (sessions.length === 0) {
      fetch(`${getApiBase()}/sessions`, { headers: getAuthHeaders() })
        .then(r => r.ok ? r.json() : [])
        .then(data => setSessionList(data))
        .catch(() => {});
    }
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${getApiBase()}/templates`, { headers: getAuthHeaders() });
      if (res.ok) setTemplates(await res.json());
    } catch (e) {}
    setLoading(false);
  };

  const addTemplate = async () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    try {
      await fetch(`${getApiBase()}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: newName.trim(), prompt: newPrompt.trim(), category: newCategory.trim() }),
      });
      setNewName(''); setNewPrompt(''); setNewCategory('');
      setShowAdd(false);
      await fetchTemplates();
    } catch (e) {}
  };

  const deleteTemplate = async (id) => {
    try {
      await fetch(`${getApiBase()}/templates/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      await fetchTemplates();
    } catch (e) {}
  };

  // Rev 6: schedule API 新形式に合わせる ({schedules: [...]}, POST {title, prompt, sessionId, kind, triggerAt})
  const fetchSchedules = async () => {
    try {
      const res = await fetch(`${getApiBase()}/schedules`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        // 新形式: {schedules: [...]}、旧形式: [...] の両対応
        const list = Array.isArray(data) ? data : (data.schedules || []);
        setSchedules(list);
      }
    } catch (e) {}
  };

  const addSchedule = async () => {
    setSchedError('');
    const h = parseInt(schedHour, 10);
    const m = parseInt(schedMinute, 10);
    if (!schedSessionId.trim()) return setSchedError('セッションIDを選択してください');
    if (!schedPrompt.trim()) return setSchedError('プロンプトを入力してください');
    if (isNaN(h) || h < 0 || h > 23) return setSchedError('時間は0〜23で入力してください');
    if (isNaN(m) || m < 0 || m > 59) return setSchedError('分は0〜59で入力してください');
    try {
      const triggerAt = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const title = schedPrompt.trim().slice(0, 40) || 'schedule';
      const res = await fetch(`${getApiBase()}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          title,
          prompt: schedPrompt.trim(),
          sessionId: schedSessionId.trim(),
          kind: schedRepeat,   // 'daily' | 'once'
          triggerAt,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return setSchedError(err.error || '登録失敗');
      }
      setSchedPrompt('');
      await fetchSchedules();
    } catch (e) { setSchedError('通信エラー'); }
  };

  const deleteSchedule = async (id) => {
    try {
      await fetch(`${getApiBase()}/schedules/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      await fetchSchedules();
    } catch (e) {}
  };

  const useTemplateForSchedule = (prompt) => {
    setSchedPrompt(prompt);
  };

  const categories = [...new Set(templates.map(t => t.category).filter(Boolean))];

  return (
    <div className="fixed inset-0 bg-cyber-bg/90 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyber-800 to-cyber-900 border-b-2 border-navi px-3 py-2 flex items-center justify-between flex-shrink-0">
        <div className="text-navi-glow font-pixel text-[10px] tracking-wider">TEMPLATES</div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(!showAdd)} className="chip-btn text-[10px] px-2.5 py-1 min-h-0">
            {showAdd ? 'CANCEL' : '+ NEW'}
          </button>
          <button onClick={onClose} className="chip-btn text-[10px] px-2.5 py-1 min-h-0">CLOSE</button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="p-3 border-b border-navi/20 space-y-2 flex-shrink-0">
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="テンプレート名"
            className="w-full bg-cyber-bg border border-cyber-500 rounded px-3 py-2 text-sm font-mono text-txt-secondary"
          />
          <textarea
            value={newPrompt} onChange={e => setNewPrompt(e.target.value)}
            placeholder="プロンプト内容..."
            rows={3}
            className="w-full bg-cyber-bg border border-cyber-500 rounded px-3 py-2 text-sm font-mono text-txt-secondary resize-none"
          />
          <div className="flex gap-2">
            <input
              value={newCategory} onChange={e => setNewCategory(e.target.value)}
              placeholder="カテゴリ（任意）"
              className="flex-1 bg-cyber-bg border border-cyber-500 rounded px-3 py-2 text-xs font-mono text-txt-secondary"
            />
            <button onClick={addTemplate} className="neon-btn text-white rounded px-4 py-2 text-xs font-mono min-h-0">
              SAVE
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="text-center text-txt-muted font-mono text-xs py-8 animate-pulse">LOADING...</div>
        ) : templates.length === 0 ? (
          <div className="text-center text-txt-muted font-mono text-xs py-8">
            // NO TEMPLATES<br />
            <span className="text-[10px]">+ NEW でよく使うプロンプトを保存</span>
          </div>
        ) : (
          <>
            {/* カテゴリなし */}
            {templates.filter(t => !t.category).map(t => (
              <TemplateCard key={t.id} template={t} onExecute={onExecute} onDelete={deleteTemplate} onSchedule={useTemplateForSchedule} />
            ))}
            {/* カテゴリ別 */}
            {categories.map(cat => (
              <div key={cat}>
                <div className="text-[9px] text-txt-muted font-mono tracking-wider mt-3 mb-1 px-1">{cat.toUpperCase()}</div>
                {templates.filter(t => t.category === cat).map(t => (
                  <TemplateCard key={t.id} template={t} onExecute={onExecute} onDelete={deleteTemplate} onSchedule={useTemplateForSchedule} />
                ))}
              </div>
            ))}
          </>
        )}

        {/* SCHEDULE セクション */}
        <div className="mt-6">
          <div className="text-[9px] text-navi font-mono tracking-widest mb-2 px-1 border-b border-navi/30 pb-1">SCHEDULE</div>

          {/* 登録フォーム */}
          <div className="pet-frame p-3 space-y-2 mb-3">
            {/* 時刻 */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-txt-muted font-mono w-10">TIME</span>
              <input
                type="number" min="0" max="23"
                value={schedHour} onChange={e => setSchedHour(e.target.value)}
                className="w-12 bg-cyber-bg border border-cyber-500 rounded px-2 py-1 text-xs font-mono text-txt-secondary text-center"
              />
              <span className="text-txt-muted font-mono">:</span>
              <input
                type="number" min="0" max="59"
                value={schedMinute} onChange={e => setSchedMinute(e.target.value)}
                className="w-12 bg-cyber-bg border border-cyber-500 rounded px-2 py-1 text-xs font-mono text-txt-secondary text-center"
              />
              <select
                value={schedRepeat} onChange={e => setSchedRepeat(e.target.value)}
                className="ml-2 bg-cyber-bg border border-cyber-500 rounded px-2 py-1 text-xs font-mono text-txt-secondary"
              >
                <option value="daily">DAILY</option>
                <option value="once">ONCE</option>
              </select>
            </div>

            {/* セッション選択 */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-txt-muted font-mono w-10">SID</span>
              <select
                value={schedSessionId} onChange={e => setSchedSessionId(e.target.value)}
                className="flex-1 bg-cyber-bg border border-cyber-500 rounded px-2 py-1 text-xs font-mono text-txt-secondary"
              >
                <option value="">-- セッションを選択 --</option>
                {sessionList.map(s => (
                  <option key={s.id} value={s.id}>{s.name || s.id.slice(0, 12)}</option>
                ))}
              </select>
            </div>

            {/* プロンプト */}
            <div className="flex items-start gap-2">
              <span className="text-[9px] text-txt-muted font-mono w-10 pt-1">PROMPT</span>
              <textarea
                value={schedPrompt} onChange={e => setSchedPrompt(e.target.value)}
                placeholder="実行するプロンプト..."
                rows={2}
                className="flex-1 bg-cyber-bg border border-cyber-500 rounded px-2 py-1 text-xs font-mono text-txt-secondary resize-none"
              />
            </div>

            {schedError && (
              <div className="text-[10px] text-alert-red font-mono px-1">{schedError}</div>
            )}

            <button onClick={addSchedule} className="neon-btn w-full py-1.5 rounded text-xs font-pixel tracking-wider text-txt-bright min-h-0">
              + REGISTER
            </button>
          </div>

          {/* 登録済みスケジュール一覧 */}
          {schedules.length === 0 ? (
            <div className="text-center text-txt-muted font-mono text-[10px] py-4">// NO SCHEDULES</div>
          ) : (
            <div className="space-y-1.5">
              {schedules.map(s => {
                // Rev 6: 新旧形式両対応
                const sessionId = s.session_id || s.sessionId || '';
                const triggerAt = s.trigger_at || s.triggerAt
                  || (s.hour != null ? `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}` : '');
                const kind = (s.kind || s.repeat || 'once').toUpperCase();
                return (
                  <div key={s.id} className="pet-frame p-2 flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-navi font-mono text-[10px]">{triggerAt}</span>
                        <span className={`text-[9px] font-mono px-1 rounded ${kind === 'DAILY' ? 'text-txt-bright bg-navi/20' : 'text-alert-yellow bg-alert-yellow/10'}`}>
                          {kind}
                        </span>
                        <span className="text-[9px] text-txt-muted font-mono truncate">{sessionId.slice(0, 12)}</span>
                      </div>
                      <div className="text-[10px] text-txt-muted font-mono truncate">{s.prompt || s.title || ''}</div>
                    </div>
                    <button onClick={() => deleteSchedule(s.id)} className="text-[9px] text-txt-muted hover:text-alert-red flex-shrink-0 px-1">DEL</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ template, onExecute, onDelete, onSchedule }) {
  return (
    <div className="pet-frame p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-navi-glow text-xs font-mono font-bold">{template.name}</span>
        <button onClick={() => onDelete(template.id)} className="text-[9px] text-txt-muted hover:text-alert-red px-1">DEL</button>
      </div>
      <div className="text-[10px] text-txt-muted font-mono mb-2 line-clamp-2">{template.prompt}</div>
      <div className="flex gap-2">
        <button
          onClick={() => onExecute(template.prompt)}
          className="neon-btn flex-1 py-2 rounded text-xs font-pixel tracking-wider text-txt-bright min-h-0"
        >
          EXECUTE
        </button>
        {onSchedule && (
          <button
            onClick={() => onSchedule(template.prompt)}
            className="chip-btn py-2 px-3 rounded text-[10px] font-mono min-h-0"
            title="スケジュールに使う"
          >
            SCHED
          </button>
        )}
      </div>
    </div>
  );
}
