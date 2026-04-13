import { useState, useMemo } from 'react';
import { useSchedules } from '../hooks/useSchedules';

// Rev 6: SchedulePanel — 旧タスクキューの置換。
//   - 一回限り (once) or 毎日 (daily) スケジュールを追加・削除
//   - 実行タイミングはサーバー側 runner (20s 間隔) で判定
export default function SchedulePanel({ activeSessionId, onClose }) {
  const { schedules, loading, error, create, remove, setStatus } = useSchedules(true);
  const [form, setForm] = useState({
    title: '',
    prompt: '',
    kind: 'once',
    datetime: defaultDatetimeLocal(),
    time: '09:00',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const pending = useMemo(() => schedules.filter(s => s.status === 'pending'), [schedules]);
  const done = useMemo(() => schedules.filter(s => s.status === 'done'), [schedules]);
  const disabled = useMemo(() => schedules.filter(s => s.status === 'disabled'), [schedules]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitError('');
    if (!form.title.trim() || !form.prompt.trim()) {
      setSubmitError('タイトルと指示文は必須');
      return;
    }
    if (!activeSessionId) {
      setSubmitError('セッションが選択されていません');
      return;
    }
    setSubmitting(true);
    try {
      const triggerAt = form.kind === 'once' ? form.datetime : form.time;
      await create({
        title: form.title.trim(),
        prompt: form.prompt.trim(),
        sessionId: activeSessionId,
        kind: form.kind,
        triggerAt,
      });
      setForm({
        title: '',
        prompt: '',
        kind: form.kind,
        datetime: defaultDatetimeLocal(),
        time: form.time,
      });
    } catch (err) {
      setSubmitError(err.message || '追加失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-cyber-bg/85 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl bg-cyber-900 border border-navi/40 shadow-neon-blue overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-navi/30 bg-cyber-950/60">
          <div>
            <div className="text-navi-glow font-pixel text-[11px] tracking-widest">SCHEDULE</div>
            <div className="text-txt-muted font-mono text-[9px]">指定時刻に Claude へ指示を自動投入</div>
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="w-9 h-9 rounded border border-cyber-500 text-txt-muted hover:border-navi hover:text-navi-glow"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Add form */}
          <form onSubmit={handleSubmit} className="space-y-2 bg-cyber-950/40 border border-cyber-600/40 rounded-lg p-3">
            <div className="text-exe-green font-mono text-[10px] mb-1">＋ 新規スケジュール</div>
            <input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="タイトル (例: 朝の進捗確認)"
              className="w-full bg-cyber-bg border border-cyber-600 rounded px-2 py-2 text-xs font-mono text-txt-secondary focus:outline-none focus:border-navi"
            />
            <textarea
              value={form.prompt}
              onChange={e => setForm({ ...form, prompt: e.target.value })}
              placeholder="指示文 (Claude に送るプロンプト)"
              rows={3}
              className="w-full bg-cyber-bg border border-cyber-600 rounded px-2 py-2 text-xs font-mono text-txt-secondary resize-none focus:outline-none focus:border-navi"
            />
            <div className="flex gap-2">
              <label className={`flex-1 text-[10px] font-mono px-2 py-2 border rounded cursor-pointer text-center ${form.kind === 'once' ? 'border-navi text-navi-glow bg-navi/10' : 'border-cyber-600 text-txt-muted'}`}>
                <input
                  type="radio"
                  name="kind"
                  value="once"
                  checked={form.kind === 'once'}
                  onChange={() => setForm({ ...form, kind: 'once' })}
                  className="hidden"
                />
                一度だけ
              </label>
              <label className={`flex-1 text-[10px] font-mono px-2 py-2 border rounded cursor-pointer text-center ${form.kind === 'daily' ? 'border-navi text-navi-glow bg-navi/10' : 'border-cyber-600 text-txt-muted'}`}>
                <input
                  type="radio"
                  name="kind"
                  value="daily"
                  checked={form.kind === 'daily'}
                  onChange={() => setForm({ ...form, kind: 'daily' })}
                  className="hidden"
                />
                毎日
              </label>
            </div>
            {form.kind === 'once' ? (
              <input
                type="datetime-local"
                value={form.datetime}
                onChange={e => setForm({ ...form, datetime: e.target.value })}
                className="w-full bg-cyber-bg border border-cyber-600 rounded px-2 py-2 text-xs font-mono text-txt-secondary focus:outline-none focus:border-navi"
              />
            ) : (
              <input
                type="time"
                value={form.time}
                onChange={e => setForm({ ...form, time: e.target.value })}
                className="w-full bg-cyber-bg border border-cyber-600 rounded px-2 py-2 text-xs font-mono text-txt-secondary focus:outline-none focus:border-navi"
              />
            )}
            {submitError && (
              <div className="text-alert-red font-mono text-[10px]">{submitError}</div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full neon-btn text-txt-bright rounded py-2 font-pixel text-[10px] tracking-widest disabled:opacity-30"
            >
              {submitting ? 'ADDING...' : 'ADD SCHEDULE'}
            </button>
          </form>

          {error && (
            <div className="text-alert-red font-mono text-[10px]">読込エラー: {error}</div>
          )}

          <Section title="PENDING" items={pending} onDelete={remove} onToggle={(id) => setStatus(id, 'disabled')} toggleLabel="停止" />
          <Section title="DISABLED" items={disabled} onDelete={remove} onToggle={(id) => setStatus(id, 'pending')} toggleLabel="再開" />
          <Section title="DONE" items={done} onDelete={remove} />

          {!loading && schedules.length === 0 && (
            <div className="text-txt-muted/60 font-mono text-[10px] text-center py-6">
              まだスケジュールはありません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, items, onDelete, onToggle, toggleLabel }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="text-navi-glow/70 font-mono text-[9px] tracking-widest mb-1">{title} ({items.length})</div>
      <ul className="space-y-1.5">
        {items.map(s => (
          <li key={s.id} className="bg-cyber-950/50 border border-cyber-600/40 rounded p-2 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-txt-bright font-mono text-xs truncate">{s.title}</div>
              <div className="text-txt-muted font-mono text-[9px] truncate">{s.prompt}</div>
              <div className="text-navi-glow/80 font-mono text-[9px] mt-0.5">
                {s.kind === 'daily' ? `毎日 ${s.trigger_at}` : formatOnce(s.next_run)}
                {s.last_error ? ` / ⚠ ${s.last_error}` : ''}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {onToggle && (
                <button
                  onClick={() => onToggle(s.id)}
                  className="text-[9px] px-2 py-0.5 border border-cyber-600 rounded text-txt-muted hover:border-navi hover:text-navi-glow"
                >
                  {toggleLabel}
                </button>
              )}
              <button
                onClick={() => onDelete(s.id)}
                className="text-[9px] px-2 py-0.5 border border-alert-red/40 rounded text-alert-red/80 hover:border-alert-red hover:text-alert-red"
              >
                削除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function defaultDatetimeLocal() {
  const d = new Date(Date.now() + 10 * 60 * 1000);
  d.setSeconds(0);
  d.setMilliseconds(0);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatOnce(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
