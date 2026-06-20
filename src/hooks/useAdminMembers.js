import { useEffect, useRef } from 'react';
import { fetchAdminCustomers } from '../lib/realtimeFetch.js';
import { saveAdminSnapshot } from '../lib/adminFullSnapshot.js';

// Yönetici paneli — hafif üye listesi sync (tam /api/state yerine)
export function useAdminMembers({ enabled = false, db, commit }) {
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    if (!enabled || !commit) return undefined;

    let cancelled = false;

    async function pullMembers() {
      let slice;
      try {
        slice = await fetchAdminCustomers();
      } catch {
        return;
      }
      if (cancelled || !slice?.customers) return;

      const current = dbRef.current;
      const next = {
        ...current,
        customers: slice.customers,
        loyalty: { ...(current.loyalty || {}), ...(slice.loyalty || {}) }
      };

      commit(next, { skipRemote: true });
      saveAdminSnapshot(next);
    }

    pullMembers();
    const timer = setInterval(pullMembers, 20_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, commit]);
}
