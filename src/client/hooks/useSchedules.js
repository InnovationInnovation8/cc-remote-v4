import { useCallback, useEffect, useState } from 'react';
import { getApiBase, getAuthHeaders, isCloudMode } from '../utils/api';

// Rev 6: useSchedules — スケジュール CRUD + 15 秒ポーリング (SSE 禁止ルールに準拠)
export function useSchedules(enabled) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const base = getApiBase();
      const headers = getAuthHeaders();
      const fetchOpts = isCloudMode() ? { headers, mode: 'cors' } : { headers };
      const res = await fetch(`${base}/schedules`, fetchOpts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSchedules(Array.isArray(data.schedules) ? data.schedules : []);
      setError('');
    } catch (e) {
      setError(e.message || 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchAll();
    const timer = setInterval(fetchAll, 15 * 1000);
    return () => clearInterval(timer);
  }, [enabled, fetchAll]);

  const create = useCallback(async ({ title, prompt, sessionId, kind, triggerAt }) => {
    const base = getApiBase();
    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
    const res = await fetch(`${base}/schedules`, {
      method: 'POST',
      headers,
      mode: isCloudMode() ? 'cors' : undefined,
      body: JSON.stringify({ title, prompt, sessionId, kind, triggerAt }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(msg || `HTTP ${res.status}`);
    }
    await fetchAll();
  }, [fetchAll]);

  const remove = useCallback(async (id) => {
    const base = getApiBase();
    const headers = getAuthHeaders();
    const res = await fetch(`${base}/schedules/${id}`, {
      method: 'DELETE',
      headers,
      mode: isCloudMode() ? 'cors' : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchAll();
  }, [fetchAll]);

  const setStatus = useCallback(async (id, status) => {
    const base = getApiBase();
    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
    const res = await fetch(`${base}/schedules/${id}`, {
      method: 'PATCH',
      headers,
      mode: isCloudMode() ? 'cors' : undefined,
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchAll();
  }, [fetchAll]);

  return { schedules, loading, error, create, remove, setStatus, refresh: fetchAll };
}
