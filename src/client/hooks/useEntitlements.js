import { useState, useEffect, useCallback } from 'react';
import { getToken, getAuthHeaders } from '../utils/api';
import { idbGet, idbSet } from '../utils/idbStore';

const CACHE_KEY = 'ccr-entitlements';
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5分

const DEFAULT_ENTITLEMENTS = {
  plan: 'free',
  features: {
    unlimitedSessions: false,
    multiPc: false,
    templates: false,
    schedule: false,
    fileBrowser: false,
    dashboard: false,
    themes: false,
    aiCharacter: false,
    voiceInput: false,
  },
};

async function loadCache() {
  try {
    const parsed = await idbGet(CACHE_KEY, null);
    if (!parsed) return null;
    // キャッシュが10分以内なら有効
    if (Date.now() - (parsed._cachedAt || 0) < 10 * 60 * 1000) return parsed;
  } catch (_) {}
  return null;
}

async function saveCache(data) {
  try {
    await idbSet(CACHE_KEY, { ...data, _cachedAt: Date.now() });
  } catch (_) {}
}

export function useEntitlements() {
  const [entitlements, setEntitlements] = useState(DEFAULT_ENTITLEMENTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEntitlements = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/entitlements', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      await saveCache(data);
      setEntitlements(data);
      setError(null);
    } catch (e) {
      setError(e.message);
      // エラー時はキャッシュをそのまま維持
    } finally {
      setLoading(false);
    }
  }, []);

  // 起動時: まずキャッシュを読み込んでから fetch
  useEffect(() => {
    loadCache().then(cached => {
      if (cached) setEntitlements(cached);
      fetchEntitlements();
    });
  }, [fetchEntitlements]);

  // 5分ごとに更新
  useEffect(() => {
    const timer = setInterval(fetchEntitlements, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchEntitlements]);

  const isPro = entitlements.plan === 'pro';
  const features = entitlements.features || DEFAULT_ENTITLEMENTS.features;

  return { isPro, plan: entitlements.plan, features, loading, error, refetch: fetchEntitlements };
}
