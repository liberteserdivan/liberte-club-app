import { useEffect, useRef } from 'react';
import { fetchCustomerLoyaltySnapshot } from '../lib/realtimeFetch.js';
import { getLpBalance, getLpLifetime } from '../lib/loyaltyStamps.js';
import { isIosNative, isNativeApp } from '../lib/platform.js';
import { isNativeAppActive, subscribeForegroundResume } from '../lib/appForeground.js';
import { isCustomerRealtimeDisabled, shouldReducePolling } from '../lib/safeMode.js';
import { getMemorySession } from '../lib/session.js';

// Anlık güncelleme realtime (websocket) ile gelir; bu yoklama yalnızca yedektir.
// Bu yüzden seyrek tutulur — boşa giden egress (giden trafik) ~%90 azalır.
// Ekran ilk açıldığında kısa bir "hızlı kontrol" penceresi bırakılır ki
// kasada yapılan işlem realtime gecikirse bile birkaç saniyede yansısın.
const LP_POLL_MS_NATIVE = 20_000;
const LP_POLL_MS_WEB = 30_000;
const LP_BURST_MS_NATIVE = 5_000;
const LP_BURST_WINDOW_MS = 20_000;
// Safe Mode / realtime kapalıyken yedek yoklama çok seyrekleşir (arka plan yükü düşer)
const LP_POLL_MS_SAFE = 120_000;

// LP kartı gerçekten değişti mi
function loyaltySnapshotChanged(prev, next) {
  if (!prev || !next) return true;
  if (getLpBalance(prev) !== getLpBalance(next)) return true;
  if (getLpLifetime(prev) !== getLpLifetime(next)) return true;
  if (Number(prev.availableRewards || 0) !== Number(next.availableRewards || 0)) return true;
  if (Number(prev.usedRewards || 0) !== Number(next.usedRewards || 0)) return true;
  return false;
}

function canPollNow() {
  if (isNativeApp()) return isNativeAppActive();
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

// Realtime yedek — kasada LP eklendiğinde müşteri ekranı güncellensin
export function useCustomerLoyaltyPoll({
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
    const burstUntil = Date.now() + (isNativeApp() ? LP_BURST_WINDOW_MS : 0);

    async function pollLoyalty() {
      if (cancelled || inFlight || !canPollNow()) return;

      inFlight = true;
      let loyalty;
      try {
        loyalty = await fetchCustomerLoyaltySnapshot();
      } catch {
        inFlight = false;
        return;
      }
      inFlight = false;
      if (cancelled || !loyalty) return;
      const session = getMemorySession();
      if (!session || Number(session.customerId) !== Number(customerId)) return;

      const current = dbRef.current;
      const prev = current.loyalty?.[customerId];
      if (!loyaltySnapshotChanged(prev, loyalty)) return;

      commit({
        ...current,
        loyalty: {
          ...(current.loyalty || {}),
          [customerId]: loyalty
        }
      }, { skipRemote: true });
    }

    function resolvePollInterval() {
      // Safe Mode/realtime kapalıyken yedek yoklama 120sn'ye çekilir
      if (isCustomerRealtimeDisabled() || shouldReducePolling()) return LP_POLL_MS_SAFE;
      if (isNativeApp() && Date.now() < burstUntil) return LP_BURST_MS_NATIVE;
      return isNativeApp() ? LP_POLL_MS_NATIVE : LP_POLL_MS_WEB;
    }

    let timer = null;

    function scheduleNextPoll() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        pollLoyalty().finally(scheduleNextPoll);
      }, resolvePollInterval());
    }

    pollLoyalty();
    scheduleNextPoll();

    function onVisible() {
      if (canPollNow()) pollLoyalty();
    }
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribeResume = subscribeForegroundResume(pollLoyalty);

    function onPageShow() {
      pollLoyalty();
    }
    if (isIosNative()) {
      window.addEventListener('pageshow', onPageShow);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      if (isIosNative()) {
        window.removeEventListener('pageshow', onPageShow);
      }
      unsubscribeResume();
    };
  }, [enabled, customerId, commit]);
}
