import { useEffect, useRef } from 'react';
import { fetchCustomerLoyaltySnapshot } from '../lib/realtimeFetch.js';

const LP_POLL_MS = 3_000;
const LP_VISIBLE_TABS = new Set(['home', 'qr', 'profile']);

// Realtime yedek — kasada LP eklendiğinde müşteri ekranı hızlı güncellensin
export function useCustomerLoyaltyPoll({
  enabled = false,
  customerId = null,
  tab = 'home',
  db,
  commit
}) {
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    if (!enabled || !customerId || !commit || !LP_VISIBLE_TABS.has(tab)) return undefined;

    let cancelled = false;

    async function pollLoyalty() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      let loyalty;
      try {
        loyalty = await fetchCustomerLoyaltySnapshot();
      } catch {
        return;
      }
      if (cancelled || !loyalty) return;

      const current = dbRef.current;
      const prev = current.loyalty?.[customerId];
      if (prev && prev.lpBalance === loyalty.lpBalance && prev.lpLifetime === loyalty.lpLifetime) {
        return;
      }

      commit({
        ...current,
        loyalty: {
          ...(current.loyalty || {}),
          [customerId]: loyalty
        }
      }, { skipRemote: true });
    }

    pollLoyalty();
    const timer = setInterval(pollLoyalty, LP_POLL_MS);

    function onVisible() {
      if (document.visibilityState === 'visible') pollLoyalty();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, customerId, tab, commit]);
}
