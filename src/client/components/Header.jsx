import { useState, useEffect } from 'react';
import { getApiBase, getAuthHeaders } from '../utils/api';

export default function Header({ onSettingsClick, connected, status, pcName }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUnread = () => {
      fetch(`${getApiBase()}/notifications/unread`, {
        headers: getAuthHeaders(),
      })
        .then(r => r.ok ? r.json() : { count: 0 })
        .then(data => setUnreadCount(data.count || 0))
        .catch(() => {});
    };
    fetchUnread();
    const timer = setInterval(fetchUnread, 5000);
    return () => clearInterval(timer);
  }, []);


  return (
    <header className="bg-gradient-to-r from-cyber-800 to-cyber-900 border-b-2 border-navi px-3 py-2 flex-shrink-0 relative">
      {/* 内枠グロー */}
      <div className="absolute inset-[1px] border border-navi-glow/8 rounded-sm pointer-events-none" />

      <div className="flex items-center gap-2.5">
        {/* 接続インジケータ */}
        <div
          aria-label="接続状態"
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border transition-all
          ${connected
            ? 'bg-[#0a0a0b] border-[#22c55e]/40 shadow-[0_0_6px_rgba(34,197,94,0.3)]'
            : 'bg-cyber-700 border-alert-red shadow-neon-red animate-neon-flicker'
          }`}>
          <span className={`text-[8px] font-mono font-bold ${connected ? 'text-[#22c55e]' : 'text-alert-red'}`}>
            {connected ? '>_C' : '!'}
          </span>
        </div>

        {/* Title + Status */}
        <div className="flex-1 min-w-0 relative z-10">
          <div className="text-navi-glow font-pixel text-[10px] tracking-wider truncate">
            CC REMOTE {pcName ? `// ${pcName}` : ''}
          </div>
          {status && (
            <div className="text-exe-yellow text-[10px] animate-pulse font-mono mt-0.5">
              &gt; {status}
            </div>
          )}
        </div>

        {/* Tutorial button (若葉マーク) */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('ccr:show-tutorial'))}
          aria-label="チュートリアルを再生"
          title="チュートリアルを再生"
          className="flex-shrink-0 w-9 h-9 rounded-lg border border-navi-glow/30 bg-cyber-900/60 flex items-center justify-center hover:border-navi-glow hover:shadow-[0_0_8px_rgba(0,232,216,0.4)] transition-all"
        >
          {/* Rev 6.1: Unicode 🔰 絵文字で「普通の若葉マーク」(向き・色とも OS 標準) */}
          <span className="text-[22px] leading-none" role="img" aria-label="チュートリアル">🔰</span>
        </button>

        {/* Config button */}
        <div className="relative flex-shrink-0">
          <button
            data-tutorial-id="settings-btn"
            onClick={onSettingsClick}
            aria-label="設定"
            className="chip-btn text-sm px-2 py-1.5 min-h-0"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-alert-red text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>

    </header>
  );
}
