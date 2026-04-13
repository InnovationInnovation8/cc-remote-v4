import { useState, useEffect } from 'react';
import { getApiBase, getAuthHeaders } from '../utils/api';

export default function ShortcutBar({ onSend, token }) {
  const [shortcuts, setShortcuts] = useState([]);

  useEffect(() => {
    if (!token) return;
    fetch(`${getApiBase()}/shortcuts`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setShortcuts(data))
      .catch(() => {});
  }, [token]);

  if (shortcuts.length === 0) return null;

  return (
    <div className="flex gap-1 overflow-x-auto mb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
      {shortcuts.map(s => (
        <button
          key={s.id}
          onClick={() => onSend(s.command + '\r')}
          className="chip-btn whitespace-nowrap flex-shrink-0 text-[10px] px-2 py-1 min-h-[36px]
            border-exe-yellow/30 text-exe-yellow/80 hover:shadow-[0_0_6px_rgba(255,215,0,0.2)]"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
