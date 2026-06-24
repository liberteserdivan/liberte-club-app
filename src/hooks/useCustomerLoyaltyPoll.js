import { useEffect, useRef } from 'react';
import { fetchCustomerLoyaltySnapshot } from '../lib/realtimeFetch.js';
import { getLpBalance, getLpLifetime } from '../lib/loyaltyStamps.js';
import { isNativeApp, isIosNative, shouldRunClientPoll } from '../lib/platform.js';
import { subscribeLoyaltyRefresh } from '../lib/loyaltySyncBus.js';

const LP_POLL_MS_NATIVE = 1_000;
const LP_POLL_MS_WEB = 2_000;
const LP_BURST_MS_NATIVE = 800;
const LP_BURST_WINDOW_MS = 90_000;

// LP kartı gerçekten değişti mi — tam JSON karşılaştırmasından hafif
function loyaltySnapshotChanged(prev, next) {
  if (!prev || !next) return true;
  if (getLpBalance(prev) !== getLpBalance(next)) return true;
  if (getLpLifetime(prev) !== getLpLifetime(next)) return true;
  if (Number(prev.availableRewards || 0) !== Number(next.availableRewards || 0)) return true;
  if (Number(prev.usedRewards || 0) !== Number(next.usedRewards || 0)) return true;
  return false;
}

// Realtime yedek — kasada LP eklendiğinde müşteri ekranı hızlı güncellensin
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
      if (cancelled || inFlight) return;
      if (!shouldRunClientPoll()) return;

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
      if (shouldRunClientPoll()) pollLoyalty();
    }
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribeRefresh = subscribeLoyaltyRefresh(pollLoyalty);

    // iOS WKWebView — arka plandan dönüşte visibility gecikebilir
    function onPageShow() {
      pollLoyalty();
    }
    if (isIosNative()) {
      window.addEventListener('pageshow', onPageShow);
    }

    let appListener = null;
    if (isNativeApp()) {
      import('@capacitor/app').then(({ App }) => {
        if (cancelled) return;
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) pollLoyalty();
        }).then((listener) => {
          appListener = listener;
        });
      }).catch(() => {});
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      if (isIosNative()) {
        window.removeEventListener('pageshow', onPageShow);
      }
      unsubscribeRefresh();
      appListener?.remove?.();
    };
  }, [enabled, customerId, commit]);
}
