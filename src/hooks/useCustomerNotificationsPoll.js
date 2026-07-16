import { useEffect, useRef } from 'react';
import { fetchCustomerNotifications } from '../lib/realtimeFetch.js';
import { isNativeAppActive } from '../lib/appForeground.js';
import { isNativeApp } from '../lib/platform.js';
import { getMemorySession } from '../lib/session.js';
import { isCustomerRealtimeDisabled, shouldReducePolling } from '../lib/safeMode.js';

const STARTUP_DELAY_MS = 8_000;
const POLL_MS_NATIVE = 60_000;
const POLL_MS_WEB = 75_000;
const POLL_MS_SAFE = 180_000;

// Bildirim listesi degisti mi?
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

function resolvePollIntervalMs() {
  if (isCustomerRealtimeDisabled() || shouldReducePolling()) return POLL_MS_SAFE;
  return isNativeApp() ? POLL_MS_NATIVE : POLL_MS_WEB;
}

// Musteri uygulama ici bildirimlerini periyodik cek
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
    let intervalId = null;

    async function pollNotifications() {
      if (cancelled || inFlight || !canPollNow()) return;
      if (isCustomerRealtimeDisabled()) return;

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

    function scheduleNextPoll() {
      if (cancelled) return;
      clearInterval(intervalId);
      intervalId = setInterval(() => {
        void pollNotifications();
      }, resolvePollIntervalMs());
    }

    const startTimer = setTimeout(() => {
      void pollNotifications().finally(scheduleNextPoll);
    }, STARTUP_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      clearInterval(intervalId);
    };
  }, [enabled, customerId, commit]);
}