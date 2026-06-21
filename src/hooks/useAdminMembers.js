import { useEffect, useRef } from 'react';
import { syncAdminMembersFromServer } from '../lib/adminMemberSync.js';

// Yönetici paneli — hafif üye listesi sync (tam /api/state yerine)
export function useAdminMembers({ enabled = false, db, commit, session = null }) {
  const dbRef = useRef(db);
  dbRef.current = db;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (!enabled || !commit) return undefined;

    let cancelled = false;

    async function pullMembers() {
      if (cancelled) return;
      try {
        await syncAdminMembersFromServer(
          dbRef.current,
          commit,
          sessionRef.current || { isAdmin: true, adminVerified: true }
        );
      } catch {
        // Arka plan sync — toast gösterme
      }
    }

    pullMembers();
    const timer = setInterval(pullMembers, 15_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, commit, session?.adminVerified, session?.customerId]);
}
