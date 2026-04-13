import { useState, useEffect, useRef } from 'react';

const COMMANDS = [
  { cmd: '/help', desc: 'ヘルプを表示' },
  { cmd: '/clear', desc: '画面をクリア' },
  { cmd: '/model', desc: 'モデルを切り替え' },
  { cmd: '/compact', desc: '会話を圧縮' },
  { cmd: '/cost', desc: 'コスト表示' },
  { cmd: '/memory', desc: 'メモリ表示' },
  { cmd: '/review', desc: 'コードレビュー' },
  { cmd: '/init', desc: 'CLAUDE.md生成' },
];

export default function CommandPalette({ isOpen, onSelect, onClose, filter }) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef(null);

  const filtered = COMMANDS.filter(c =>
    c.cmd.toLowerCase().includes((filter || '').toLowerCase()) ||
    c.desc.includes(filter || '')
  );

  useEffect(() => setSelected(0), [filter]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && filtered[selected]) { e.preventDefault(); onSelect(filtered[selected].cmd); }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, selected, filtered, onSelect, onClose]);

  if (!isOpen || filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-cyber-surface border border-cyber-border rounded-lg shadow-xl overflow-hidden z-50 max-h-[200px] overflow-y-auto"
      ref={listRef}>
      {filtered.map((c, i) => (
        <button
          key={c.cmd}
          onClick={() => onSelect(c.cmd)}
          className={`w-full px-3 py-2 flex items-center gap-3 text-left text-sm
            ${i === selected ? 'bg-cyber-accent/20 text-cyber-accent' : 'text-cyber-text hover:bg-cyber-bg'}`}
        >
          <span className="font-mono text-cyber-accent font-bold">{c.cmd}</span>
          <span className="text-cyber-dim text-xs">{c.desc}</span>
        </button>
      ))}
    </div>
  );
}
