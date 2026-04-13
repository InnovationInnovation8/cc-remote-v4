// CC-Remote v4 — useAuth (PIN-only, no Firebase)
import { useState, useCallback, useEffect } from 'react';
import { getToken, clearToken, getApiBase, getAuthHeaders } from '../utils/api';

export function useAuth() {
  const [token, setTokenState] = useState(() => getToken());

  const isAuthenticated = !!token;

  const login = useCallback(() => {
    setTokenState(getToken());
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
  }, []);

  // Token validation: re-check when remoteBase or token changes
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const base = getApiBase();
    const headers = getAuthHeaders();
    fetch(`${base}/sessions`, { headers, mode: 'cors', signal: controller.signal })
      .then(r => { if (r.status === 401) logout(); })
      .catch(() => {});
    return () => controller.abort();
  }, [token, logout]);

  // v4: 2FA / PIN session / Firebase ID token refresh は削除
  // 互換のため markPinVerified / clearPinVerification / pinVerified も no-op で残す
  const pinVerified = true;
  const markPinVerified = useCallback(() => {}, []);
  const clearPinVerification = useCallback(() => {}, []);

  return { isAuthenticated, token, pinVerified, login, logout, markPinVerified, clearPinVerification };
}
