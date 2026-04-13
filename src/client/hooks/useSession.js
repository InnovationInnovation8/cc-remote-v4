import { useState, useCallback, useEffect } from 'react';
import { getApiBase, getToken, getAuthHeaders } from '../utils/api';

export function useSession(token) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  });

  const fetchSessions = useCallback(async () => {
    const currentToken = getToken() || token;
    if (!currentToken) return;
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${getApiBase()}/sessions`, { headers });
      if (res.ok) setSessions(await res.json());
    } catch (e) {} finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const createSession = useCallback(async (name) => {
    const res = await fetch(`${getApiBase()}/sessions`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ name: name || 'New Session' }),
    });
    if (!res.ok) throw new Error('セッション作成失敗');
    const session = await res.json();
    setSessions(prev => [...prev, session]);
    return session;
  }, [token]);

  const deleteSession = useCallback(async (id) => {
    await fetch(`${getApiBase()}/sessions/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    setSessions(prev => prev.filter(s => s.id !== id));
  }, [token]);

  const renameSession = useCallback(async (id, name) => {
    await fetch(`${getApiBase()}/sessions/${id}`, {
      method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ name }),
    });
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  }, [token]);

  const setMemo = useCallback(async (id, memo) => {
    await fetch(`${getApiBase()}/sessions/${id}`, {
      method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ memo }),
    });
    setSessions(prev => prev.map(s => s.id === id ? { ...s, memo } : s));
  }, [token]);

  const sendInput = useCallback(async (id, text) => {
    await fetch(`${getApiBase()}/sessions/${id}/input`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ text }),
    });
  }, [token]);

  const sendKey = useCallback(async (id, key) => {
    await fetch(`${getApiBase()}/sessions/${id}/key`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ key }),
    });
  }, [token]);

  const searchSession = useCallback(async (id, q) => {
    const res = await fetch(`${getApiBase()}/sessions/${id}/search?q=${encodeURIComponent(q)}`, {
      headers: getAuthHeaders(),
    });
    return res.ok ? res.json() : [];
  }, [token]);

  const listClaudeSessions = useCallback(async () => {
    const res = await fetch(`${getApiBase()}/sessions/claude-history`, { headers: getAuthHeaders() });
    return res.ok ? res.json() : [];
  }, [token]);

  // Rev 5 REV5-001: projectCwd を受け取って resume API に渡す。
  // これで PC Agent 側で正しい project ディレクトリで claude --resume が起動し、
  // "No conversation found" エラーを回避できる。
  const resumeClaudeSession = useCallback(async (claudeSessionId, name, projectCwd) => {
    const res = await fetch(`${getApiBase()}/sessions/resume`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ claudeSessionId, name, projectCwd }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'セッション再開失敗');
    }
    const session = await res.json();
    setSessions(prev => [...prev, session]);
    return session;
  }, [token]);

  const togglePin = useCallback(async (id) => {
    const session = sessions.find(s => s.id === id);
    const pinned = !session?.pinned;
    await fetch(`${getApiBase()}/sessions/${id}`, {
      method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ pinned }),
    });
    setSessions(prev => prev.map(s => s.id === id ? { ...s, pinned } : s));
  }, [token, sessions]);

  const toggleArchive = useCallback(async (id) => {
    const session = sessions.find(s => s.id === id);
    const archived = !session?.archived;
    await fetch(`${getApiBase()}/sessions/${id}`, {
      method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ archived }),
    });
    setSessions(prev => prev.map(s => s.id === id ? { ...s, archived } : s));
  }, [token, sessions]);

  const setTags = useCallback(async (id, tags) => {
    await fetch(`${getApiBase()}/sessions/${id}`, {
      method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ tags }),
    });
    setSessions(prev => prev.map(s => s.id === id ? { ...s, tags } : s));
  }, [token]);

  const setApprovalLevel = useCallback(async (id, approvalLevel) => {
    await fetch(`${getApiBase()}/sessions/${id}`, {
      method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ approvalLevel }),
    });
    setSessions(prev => prev.map(s => s.id === id ? { ...s, approvalLevel } : s));
  }, [token]);

  const handoffSession = useCallback(async (fromSessionId) => {
    const fromSession = sessions.find(s => s.id === fromSessionId);
    const fromName = fromSession?.name || fromSessionId;

    const exportRes = await fetch(`${getApiBase()}/sessions/${fromSessionId}/export`, {
      headers: getAuthHeaders(),
    });
    let lastLines = '';
    if (exportRes.ok) {
      const { text } = await exportRes.json();
      const lines = (text || '').split('\n').filter(l => l.trim());
      lastLines = lines.slice(-5).join('\n');
    }

    const newSession = await createSession(`引き継ぎ: ${fromName}`);
    const message = `前のセッション(${fromName})の出力要約:\n${lastLines}\n\nこの続きから作業してください。`;
    await fetch(`${getApiBase()}/sessions/${newSession.id}/input`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ text: message + '\r' }),
    });
    return newSession;
  }, [token, sessions, createSession]);

  return {
    sessions, loading, fetchSessions,
    createSession, deleteSession, renameSession, setMemo,
    togglePin, toggleArchive, setApprovalLevel, setTags,
    sendInput, sendKey, searchSession,
    listClaudeSessions, resumeClaudeSession, handoffSession,
  };
}
