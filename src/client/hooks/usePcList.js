// CC-Remote v2 UI — usePcList
// PCTabs.jsx から抽出した PC 一覧管理ロジック。
// - dispatcher モード: VITE_DISPATCHER_URL 非空 or VITE_DISPATCHER_MODE=1 → Workers /api/pcs へ fetch
// - localStorage モード: 既存 pcStore + pingPc ベース
//
// 返り値（App.jsx から PCTabs / PCDropdown へ props で配布する）:
//   { pcs, statuses, heartbeats, loading, authError, networkError, handleManualRetry }
//
// Note: activePcId は App.jsx 側で useState 管理を継続し、本 hook からは返さない。
//       理由: 既存の handleSelectPC ロジック温存 + IDB ownership 重複回避（Phase 2 回帰リスク最小化）。
import { useState, useEffect, useCallback } from 'react';
import { listPcs, pingPc, fetchPcsFromDispatcher } from '../utils/pcStore';

const DISPATCHER_URL = import.meta.env.VITE_DISPATCHER_URL || '';
const DISPATCHER_MODE = !!DISPATCHER_URL || import.meta.env.VITE_DISPATCHER_MODE === '1';
const OFFLINE_TTL_MS = 10 * 60 * 1000; // 10分

function isLocalPC(pc) {
  if (!pc.url) return true;
  try {
    return new URL(pc.url).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function usePcList() {
  const [pcs, setPcs] = useState(() => listPcs());
  const [statuses, setStatuses] = useState({});
  const [heartbeats, setHeartbeats] = useState({});
  const [loading, setLoading] = useState(DISPATCHER_MODE);
  const [authError, setAuthError] = useState(false);
  const [networkError, setNetworkError] = useState(false);

  // --- dispatcher モード ---
  const loadFromDispatcher = useCallback(async () => {
    try {
      const rawPcs = await fetchPcsFromDispatcher(DISPATCHER_URL);
      const now = Date.now();
      const mapped = rawPcs.map((pc) => ({
        id: pc.pcId,
        label: pc.label || pc.pcId,
        url: pc.tunnel_url || '',
        lastHeartbeatAt: pc.last_heartbeat_at,
        registeredAt: pc.registered_at,
      }));
      const nextStatuses = {};
      const nextHeartbeats = {};
      for (const pc of mapped) {
        const age = pc.lastHeartbeatAt ? now - pc.lastHeartbeatAt : Infinity;
        nextStatuses[pc.id] = age <= OFFLINE_TTL_MS ? 'online' : 'offline';
        nextHeartbeats[pc.id] = pc.lastHeartbeatAt;
      }
      setPcs(mapped);
      setStatuses(nextStatuses);
      setHeartbeats(nextHeartbeats);
      setAuthError(false);
      setNetworkError(false);
    } catch (err) {
      if (err.status === 401) {
        setAuthError(true);
        setNetworkError(false);
      } else {
        setNetworkError(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualRetry = useCallback(() => {
    setLoading(true);
    loadFromDispatcher();
  }, [loadFromDispatcher]);

  // --- localStorage モード: storage / cc-remote:pcs-changed で pcs 再ロード ---
  useEffect(() => {
    if (DISPATCHER_MODE) return;
    const reload = () => setPcs(listPcs());
    window.addEventListener('storage', reload);
    window.addEventListener('cc-remote:pcs-changed', reload);
    return () => {
      window.removeEventListener('storage', reload);
      window.removeEventListener('cc-remote:pcs-changed', reload);
    };
  }, []);

  // localStorage モード: 個別 ping による健全性チェック
  useEffect(() => {
    if (DISPATCHER_MODE) return;
    let cancelled = false;
    const check = async () => {
      const next = {};
      await Promise.all(pcs.map(async (pc) => {
        if (isLocalPC(pc)) { next[pc.id] = 'online'; return; }
        const ok = await pingPc(pc.url);
        next[pc.id] = ok ? 'online' : 'offline';
      }));
      if (!cancelled) setStatuses(next);
    };
    check();
    const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pcs]);

  // dispatcher モード: 初回 + 15秒ごとにリフレッシュ
  useEffect(() => {
    if (!DISPATCHER_MODE) return;
    loadFromDispatcher();
    const interval = setInterval(loadFromDispatcher, 15000);
    return () => clearInterval(interval);
  }, [loadFromDispatcher]);

  return {
    pcs,
    statuses,
    heartbeats,
    loading,
    authError,
    networkError,
    handleManualRetry,
    isDispatcherMode: DISPATCHER_MODE,
    dispatcherUrl: DISPATCHER_URL,
  };
}
