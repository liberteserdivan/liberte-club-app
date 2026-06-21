import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAdminMemberSync, loadAdminMembersSlice } from '../lib/adminMemberSync.js';

// Yönetici paneli — üye listesi ayrı state (db sync ezmesinden bağımsız)
export function useAdminMembers({ enabled = false, commit, session = null }) {
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const pullMembers = useCallback(async () => {
    if (!commit) return false;
    setStatus('loading');
    setError('');

    try {
      const slice = await loadAdminMembersSlice(sessionRef.current);
      setMembers(slice.customers || []);
      applyAdminMemberSync(commit, slice, sessionRef.current);
      setStatus('ready');
      return true;
    } catch (e) {
      setError(e?.message || 'Üye listesi yüklenemedi');
      setStatus('error');
      return false;
    }
  }, [commit]);

  useEffect(() => {
    if (!enabled || !commit) {
      setMembers([]);
      setStatus('idle');
      setError('');
      return undefined;
    }

    pullMembers();
    const timer = setInterval(pullMembers, 15_000);
    return () => clearInterval(timer);
  }, [enabled, commit, pullMembers, session?.adminVerified, session?.customerId]);

  return { members, status, error, refreshMembers: pullMembers };
}
