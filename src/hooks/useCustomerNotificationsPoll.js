import { useEffect, useRef } from 'react';
import { fetchCustomerNotifications } from '../lib/realtimeFetch.js';
import { isNativeAppActive } from '../lib/appForeground.js';
import { isNativeApp } from '../lib/platform.js';
import { getMemorySession } from '../lib/session.js';

const STARTUP_DELAY_MS = 6_000;
const POLL_MS = 45_000;

// Bildirim listesi değişti mi?
function notificationsChanged(prev = [], next = []) {
  if (prev.length !== next.length) return true;
  const prevHead = prev[0];
  const nextHead = next[0];
  if (!prevHead && !nextHead) return false;
  if (!prevHead || !nextHead) return true;
  return Number(prevHead.id) !== Number(nextHead.id);
}

function canPollNow() {
  if (isNativeApp()) return isNativeAppActive();
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

// Müşteri uygulama içi bildirimlerini periyodik çek
export function useCustomerNotificationsPoll({
  enabled = false,
  customerId = null,
  db,
  commit
}) {
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    if (!enabled || !customerId || !commit) return undefined;

    let cancelled = false;
    let inFlight = false;

    async function pollNotifications() {
      if (cancelled || inFlight || !canPollNow()) return;

      inFlight = true;
      let rows = [];
      try {
        rows = await fetchCustomerNotifications();
      } catch {
        inFlight = false;
        return;
      }
      inFlight = false;

      if (cancelled || !Array.isArray(rows)) return;
      const session = getMemorySession();
      if (!session || Number(session.customerId) !== Number(customerId)) return;

      const current = dbRef.current;
      const prev = (current.notifications || []).filter(
        (row) => !row.customerId || Number(row.customerId) === Number(customerId)
      );
      if (!notificationsChanged(prev, rows)) return;

      commit({
        ...current,
        notifications: rows
      }, { skipRemote: true });
    }

    const startTimer = setTimeout(() => {
      void pollNotifications();
    }, STARTUP_DELAY_MS);

    const interval = setInterval(() => {
      void pollNotifications();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      clearInterval(interval);
    };
  }, [enabled, customerId, commit]);
}