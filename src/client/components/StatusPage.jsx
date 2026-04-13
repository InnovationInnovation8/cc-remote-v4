import { useState, useEffect } from 'react';
import { getApiBase, getAuthHeaders } from '../utils/api';

export default function StatusPage({ token, onClose }) {
  const [status, setStatus] = useState(null);
  const [controlling, setControlling] = useState(null);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`${getApiBase()}/status`, { headers: getAuthHeaders() });
        if (res.ok) setStatus(await res.json());
      } catch (e) {}
    };
    fetch_();
    const timer = setInterval(fetch_, 5000);
    return () => clearInterval(timer);
  }, [token]);

  const pcControl = async (action) => {
    if (action === 'shutdown' && !confirm('60秒後にシャットダウンします。よろしいですか？')) return;
    setControlling(action);
    try {
      await fetch(`${getApiBase()}/pc-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action }),
      });
    } catch (e) {}
    setTimeout(() => setControlling(null), 2000);
  };

  const openApp = async (appPath) => {
    if (!appPath) return;
    setControlling('open-app');
    try {
      await fetch(`${getApiBase()}/pc-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: 'open-app', appPath }),
      });
    } catch (e) {}
    setTimeout(() => setControlling(null), 2000);
  };

  const openAppPrompt = () => {
    const appPath = prompt('アプリのパスを入力してください:');
    if (appPath) openApp(appPath);
  };

  const fmt = (bytes) => {
    if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes > 1e6) return (bytes / 1e6).toFixed(0) + ' MB';
    return (bytes / 1e3).toFixed(0) + ' KB';
  };

  const fmtTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="flex flex-col h-full bg-cyber-bg">
      <div className="bg-gradient-to-r from-cyber-800 to-cyber-900 border-b-2 border-navi px-3 py-2 flex items-center flex-shrink-0">
        <button onClick={onClose} className="text-navi-glow mr-3 text-lg">←</button>
        <span className="font-pixel text-navi-glow text-[10px] tracking-wider">STATUS</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!status ? (
          <div className="text-txt-muted text-center font-mono text-xs py-8 animate-pulse">LOADING...</div>
        ) : (
          <>
            {/* ホスト情報 */}
            <div className="pet-frame p-3">
              <div className="text-navi-glow font-mono text-xs mb-2">{status.hostname}</div>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-txt-muted">
                <div>Platform: {status.platform}</div>
                <div>Node: {status.node}</div>
                <div>Uptime: {fmtTime(status.uptime)}</div>
                <div>Cores: {status.cpu.cores}</div>
              </div>
            </div>

            {/* CPU */}
            <div className="pet-frame p-3">
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-txt-secondary">CPU</span>
                <span className="text-navi-glow">{status.cpu.usage}%</span>
              </div>
              <div className="w-full h-2 bg-cyber-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    status.cpu.usage > 80 ? 'hp-bar-fill danger' : status.cpu.usage > 50 ? 'hp-bar-fill warning' : 'hp-bar-fill'
                  }`}
                  style={{ width: `${status.cpu.usage}%` }}
                />
              </div>
            </div>

            {/* メモリ */}
            <div className="pet-frame p-3">
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-txt-secondary">MEMORY</span>
                <span className="text-navi-glow">{fmt(status.memory.used)} / {fmt(status.memory.total)}</span>
              </div>
              <div className="w-full h-2 bg-cyber-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    status.memory.percent > 80 ? 'hp-bar-fill danger' : status.memory.percent > 60 ? 'hp-bar-fill warning' : 'hp-bar-fill'
                  }`}
                  style={{ width: `${status.memory.percent}%` }}
                />
              </div>
            </div>

            {/* トンネルURL */}
            {status.tunnelUrl && (
              <div className="pet-frame p-3">
                <div className="text-xs font-mono text-txt-secondary mb-1">TUNNEL</div>
                <div className="text-[10px] font-mono text-navi-glow break-all">{status.tunnelUrl}</div>
              </div>
            )}

            {/* PC制御 */}
            <div className="pet-frame p-3">
              <div className="text-xs font-mono text-txt-secondary mb-2">PC CONTROL</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => pcControl('lock')} disabled={!!controlling}
                  className="chip-btn text-[10px] py-2 disabled:opacity-50">
                  {controlling === 'lock' ? '...' : 'LOCK'}
                </button>
                <button onClick={() => pcControl('sleep')} disabled={!!controlling}
                  className="chip-btn text-[10px] py-2 disabled:opacity-50">
                  {controlling === 'sleep' ? '...' : 'SLEEP'}
                </button>
                <button onClick={() => pcControl('shutdown')} disabled={!!controlling}
                  className="chip-btn border-alert-red/30 text-alert-red text-[10px] py-2 disabled:opacity-50">
                  {controlling === 'shutdown' ? '...' : 'SHUTDOWN'}
                </button>
                <button onClick={() => pcControl('cancel-shutdown')} disabled={!!controlling}
                  className="chip-btn text-[10px] py-2 disabled:opacity-50">
                  {controlling === 'cancel-shutdown' ? '...' : 'CANCEL SD'}
                </button>
                <button onClick={openAppPrompt} disabled={!!controlling}
                  className="chip-btn text-[10px] py-2 disabled:opacity-50 col-span-2">
                  {controlling === 'open-app' ? '...' : 'APP'}
                </button>
              </div>
              <div className="text-xs font-mono text-txt-secondary mt-3 mb-2">PRESET APPS</div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => openApp('notepad.exe')} disabled={!!controlling}
                  className="chip-btn text-[10px] py-2 disabled:opacity-50">
                  {controlling === 'open-app' ? '...' : 'NOTEPAD'}
                </button>
                <button onClick={() => openApp('explorer.exe')} disabled={!!controlling}
                  className="chip-btn text-[10px] py-2 disabled:opacity-50">
                  {controlling === 'open-app' ? '...' : 'EXPLORER'}
                </button>
                <button onClick={() => openApp('https://google.com')} disabled={!!controlling}
                  className="chip-btn text-[10px] py-2 disabled:opacity-50">
                  {controlling === 'open-app' ? '...' : 'BROWSER'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
