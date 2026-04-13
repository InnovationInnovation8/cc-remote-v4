import { useState } from 'react';
import { getAuthHeaders } from '../utils/api';

export default function BugReport({ token, onClose }) {
  const [type, setType] = useState('bug'); // bug | feature | other
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ sessionId: 'report', rating: 0, context: JSON.stringify({ type, text: text.trim(), timestamp: Date.now() }) }),
      });
      setSent(true);
      setTimeout(onClose, 1500);
    } catch (e) {}
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="pet-frame p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-navi-glow font-pixel text-[10px] tracking-wider mb-4">FEEDBACK</h3>

        {sent ? (
          <div className="text-exe-green font-mono text-sm text-center py-8">送信完了！</div>
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              {[['bug', 'BUG'], ['feature', 'REQUEST'], ['other', 'OTHER']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setType(val)}
                  className={`flex-1 py-1.5 rounded text-[10px] font-mono border transition-all ${
                    type === val ? 'border-navi-glow bg-navi/10 text-navi-glow' : 'border-cyber-600 text-txt-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={type === 'bug' ? 'どんなバグですか？\n再現手順を教えてください' : type === 'feature' ? 'どんな機能が欲しいですか？' : '自由にどうぞ'}
              rows={4}
              className="w-full bg-cyber-bg border border-cyber-500 rounded px-3 py-2 text-sm font-mono text-txt-secondary resize-none mb-3"
            />

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 chip-btn py-2">CANCEL</button>
              <button onClick={send} className="flex-1 neon-btn text-white py-2 rounded text-sm font-mono">SEND</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
