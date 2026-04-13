import { useState } from 'react';

export default function SessionMenu({ session, onRename, onDelete, onMemo, onClose }) {
  const [name, setName] = useState(session?.name || '');
  const [memo, setMemo] = useState(session?.memo || '');

  if (!session) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50" onClick={onClose}>
      <div
        className="bg-cyber-surface border-t border-cyber-border rounded-t-xl p-4 w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-8 h-1 bg-cyber-border rounded-full mx-auto mb-4" />

        <h3 className="text-cyber-accent font-bold mb-4">{session.name}</h3>

        {/* Rename */}
        <div className="mb-3">
          <label className="text-xs text-cyber-dim block mb-1">セッション名</label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="flex-1 bg-cyber-bg border border-cyber-border rounded-lg px-3 py-2 text-sm text-cyber-text"
            />
            <button
              onClick={() => { onRename(session.id, name); onClose(); }}
              className="bg-cyber-accent text-cyber-bg px-3 py-2 rounded-lg text-sm font-bold"
            >
              変更
            </button>
          </div>
        </div>

        {/* Memo */}
        <div className="mb-4">
          <label className="text-xs text-cyber-dim block mb-1">メモ</label>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={2}
            className="w-full bg-cyber-bg border border-cyber-border rounded-lg px-3 py-2 text-sm text-cyber-text resize-none"
            placeholder="メモを入力..."
          />
          <button
            onClick={() => { onMemo(session.id, memo); onClose(); }}
            className="text-cyber-accent text-xs mt-1"
          >
            保存
          </button>
        </div>

        {/* Delete */}
        <button
          onClick={() => { onDelete(session.id); onClose(); }}
          className="w-full py-2 rounded-lg border border-cyber-red text-cyber-red text-sm"
        >
          セッションを削除
        </button>
      </div>
    </div>
  );
}
