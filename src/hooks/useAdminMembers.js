import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAdminMemberSync, loadAdminMembersSlice, pickAdminMemberList } from '../lib/adminMemberSync.js';

// Yönetici paneli — üye listesi ayrı state (db sync ezmesinden bağımsız)
export function useAdminMembers({ enabled = false, commit, session = null, db = null }) {
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

    // Üye listesi büyük olabilir; sık çekmek egress'i şişirir.
    // Realtime değişiklikleri zaten tetikler, bu yüzden 60 sn yeterli.
    pullMembers();
    const timer = setInterval(pullMembers, 60_000);
    return () => clearInterval(timer);
  }, [enabled, commit, pullMembers, session?.adminVerified, session?.customerId]);

  // Tam state sync sonrası db'deki üyeleri de yansıt
  useEffect(() => {
    if (!enabled) return;
    const merged = pickAdminMemberList({
      adminMembers: members,
      adminMembersStatus: status,
      db
    });
    if (merged.length > members.length) {
      setMembers(merged);
    }
  }, [enabled, db, members, status]);

  return { members, status, error, refreshMembers: pullMembers };
}
