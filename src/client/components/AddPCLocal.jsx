// CC-Remote v4 — Add PC dialog (URL paste / QR scan deferred to v4.1)
// Replaces AddPC.jsx (cloud-pairing flow, retired in v4 MVP).
import { useState } from 'react';
import { addPc } from '../utils/pcStore';

export default function AddPCLocal({ onClose, onAdded }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    try {
      const u = url.trim();
      if (!u.startsWith('http')) {
        setError('URLは https:// で始めてください');
        return;
      }
      // Validate URL syntax
      try { new URL(u); } catch { setError('URL形式が不正です'); return; }
      const pc = addPc({ label, url: u });
      onAdded(pc);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-cyber-800 border border-cyber-600/70 rounded p-5 w-full max-w-sm">
        <div className="text-navi-glow font-pixel text-[11px] tracking-widest mb-3">PC ADD</div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-txt-muted font-mono text-[10px] mb-1">表示名（任意）</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例: My Home PC"
              className="w-full bg-cyber-900 border border-cyber-600/50 rounded px-2 py-1.5 text-txt-bright font-mono text-xs focus:border-navi/70 focus:outline-none"
              maxLength={50}
            />
          </div>
          <div>
            <label className="block text-txt-muted font-mono text-[10px] mb-1">トンネルURL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xxx.trycloudflare.com"
              className="w-full bg-cyber-900 border border-cyber-600/50 rounded px-2 py-1.5 text-txt-bright font-mono text-xs focus:border-navi/70 focus:outline-none"
              required
              autoFocus
            />
            <div className="text-txt-muted/60 font-mono text-[9px] mt-1">
              対象PCのターミナルに表示されるURLを入力
            </div>
          </div>
          {error && (
            <div className="text-alert-red font-mono text-[10px] bg-alert-red/10 border border-alert-red/30 rounded px-2 py-1">
              {error}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-1.5 border border-cyber-600/50 rounded text-txt-muted font-mono text-xs hover:border-cyber-500 hover:text-txt-bright"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 px-3 py-1.5 bg-navi/20 border border-navi/50 rounded text-navi-glow font-mono text-xs hover:bg-navi/30"
            >
              追加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
