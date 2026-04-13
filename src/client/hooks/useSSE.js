import { useState, useEffect, useRef, useCallback } from 'react';
import { getApiBase, isCloudMode, getActivePcId, getAuthHeaders } from '../utils/api';
import { friendlyError } from '../utils/errorMessages';

export function useSSE(sessionId, token, onAuthError) {
  const [output, setOutput] = useState([]);
  const [status, setStatus] = useState('');
  const [connected, setConnected] = useState(null); // null = not yet attempted
  const [ready, setReady] = useState(false);
  const [contextUsage, setContextUsage] = useState(0);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const lastScreenRef = useRef('');

  useEffect(() => {
    setOutput([]);
    setStatus('');
    setReady(false);
    setContextUsage(0);
    lastScreenRef.current = '';
  }, [sessionId]);

  // ---------------------------------------------------------------------------
  // Polling (500ms) — used for both local and cloud mode
  // SSE is NOT used (incompatible with Cloudflare Tunnel)
  // ---------------------------------------------------------------------------
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!sessionId || !token) return;

    const poll = async () => {
      try {
        const headers = getAuthHeaders();
        const res = await fetch(`${getApiBase()}/sessions/${sessionId}`, {
          headers,
          mode: isCloudMode() ? 'cors' : undefined,
        });
        if (res.status === 401) {
          if (onAuthError) onAuthError();
          return;
        }
        if (!res.ok) return;

        const data = await res.json();
        setConnected(true);
        setError(null);
        setReady(!!data.claudeReady);
        setStatus(data.claudeStatus || data.status || '');
        if (data.contextUsage !== undefined) setContextUsage(data.contextUsage);

        if (data.recentOutput && data.recentOutput !== lastScreenRef.current) {
          lastScreenRef.current = data.recentOutput;
          setOutput(data.recentOutput.split('\n'));
        }
      } catch (err) {
        setConnected(false);
        setError(friendlyError(err));
      }
    };

    poll();
    pollRef.current = setInterval(poll, 500);
  }, [sessionId, token, onAuthError]);

  // ---------------------------------------------------------------------------
  // Start/stop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    startPolling();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [startPolling]);

  const clearOutput = useCallback(() => {
    setOutput([]);
    lastScreenRef.current = '';
  }, []);

  return { output, status, connected, ready, contextUsage, error, clearOutput };
}
