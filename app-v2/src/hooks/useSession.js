import { useCallback, useEffect, useState } from 'react';
import { setUnauthorizedHandler } from '../lib/apiClient.js';
import { clearSession, getSession } from '../lib/sessionStore.js';
import { restoreSession } from '../services/authService.js';

export function useSessionBootstrap() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      setSession(null);
    });
    let cancelled = false;
    (async () => {
      try {
        const restored = await restoreSession();
        if (!cancelled && restored) setSession(restored);
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updateSession = useCallback((next) => {
    setSession(next || getSession());
  }, []);

  const logoutLocal = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  return { session, booting, setSession: updateSession, logoutLocal };
}
