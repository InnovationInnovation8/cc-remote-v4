import { useState, useEffect } from 'react';
import { getApiBase, getAuthHeaders } from '../utils/api';

function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function Dashboard({ token, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`${getApiBase()}/dashboard`, { headers: getAuthHeaders() });
        if (res.ok) setData(await res.json());
      } catch (e) {}
    };
    fetch_();
    const timer = setInterval(fetch_, 5000);
    return () => clearInterval(timer);
  }, [token]);

  const fbTotal = data?.feedback?.total || 0;
  const fbPositive = data?.feedback?.positive || 0;
  const fbNegative = data?.feedback?.negative || 0;
  const fbPositivePct = fbTotal > 0 ? Math.round((fbPositive / fbTotal) * 100) : 0;

  // トークンゲージ: 100K を基準
  const TOKEN_MAX = 100_000;
  const tokenPct = Math.min(100, Math.round(((data?.estimatedTokens || 0) / TOKEN_MAX) * 100));

  return (
    <div className="flex flex-col h-full bg-cyber-bg">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-cyber-800 to-cyber-900 border-b-2 border-navi px-3 py-2 flex items-center flex-shrink-0">
        <button onClick={onClose} className="text-navi-glow mr-3 text-lg">←</button>
        <span className="font-pixel text-navi-glow text-[10px] tracking-wider">DASHBOARD</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!data ? (
          <div className="text-txt-muted text-center font-mono text-xs py-8 animate-pulse">LOADING...</div>
        ) : (
          <>
            {/* セッション */}
            <div className="pet-frame p-3">
              <div className="text-xs font-mono text-txt-secondary mb-3">SESSIONS</div>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="TOTAL" value={data.sessions.total} color="text-navi-glow" />
                <StatCard label="ACTIVE" value={data.sessions.active} color="text-exe-green" />
                <StatCard label="ARCHIVED" value={data.sessions.archived} color="text-txt-muted" />
              </div>
            </div>

            {/* 推定トークン使用量 */}
            <div className="pet-frame p-3">
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-txt-secondary">EST. TOKENS</span>
                <span className="text-navi-glow">{fmtTokens(data.estimatedTokens)}</span>
              </div>
              <div className="w-full h-2 bg-cyber-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    tokenPct > 80 ? 'hp-bar-fill danger' : tokenPct > 50 ? 'hp-bar-fill warning' : 'hp-bar-fill'
                  }`}
                  style={{ width: `${tokenPct}%` }}
                />
              </div>
              <div className="text-[10px] font-mono text-txt-muted mt-1">
                {tokenPct}% of {fmtTokens(TOKEN_MAX)} baseline
              </div>
            </div>

            {/* フィードバック */}
            <div className="pet-frame p-3">
              <div className="text-xs font-mono text-txt-secondary mb-2">FEEDBACK</div>
              {fbTotal === 0 ? (
                <div className="text-txt-muted text-xs font-mono">フィードバックなし</div>
              ) : (
                <>
                  <div className="flex justify-between text-[10px] font-mono mb-1">
                    <span className="text-exe-green">OK: {fbPositive}</span>
                    <span className="text-txt-muted">TOTAL: {fbTotal}</span>
                    <span className="text-alert-red">NG: {fbNegative}</span>
                  </div>
                  <div className="w-full h-2.5 bg-cyber-700 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-exe-green/70 transition-all"
                      style={{ width: `${fbPositivePct}%` }}
                    />
                    <div
                      className="h-full bg-alert-red/70 transition-all"
                      style={{ width: `${100 - fbPositivePct}%` }}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-txt-muted mt-1">{fbPositivePct}% positive</div>
                </>
              )}
            </div>

            {/* テンプレート・ショートカット */}
            <div className="pet-frame p-3">
              <div className="text-xs font-mono text-txt-secondary mb-3">RESOURCES</div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="TEMPLATES" value={data.templateCount} color="text-navi-glow" />
                <StatCard label="SHORTCUTS" value={data.shortcutCount} color="text-navi-glow" />
              </div>
            </div>

            {/* サーバーUptime */}
            <div className="pet-frame p-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono text-txt-secondary">SERVER UPTIME</span>
                <span className="text-navi-glow font-mono text-sm">{fmtUptime(data.serverUptime)}</span>
              </div>
            </div>

            <div className="text-center text-cyber-dim text-[10px] font-mono pt-1">
              AUTO-REFRESH: 5s
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="flex flex-col items-center py-2">
      <div className={`text-2xl font-pixel font-bold ${color}`}>{value}</div>
      <div className="text-[9px] font-mono text-txt-muted mt-1">{label}</div>
    </div>
  );
}
