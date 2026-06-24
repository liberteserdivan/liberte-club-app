import { useEffect, useRef } from 'react';
import {
  closeRealtimeChannel,
  createDebouncedTask,
  openRealtimeChannel
} from '../lib/realtimeManager.js';
import {
  fetchCustomerHistory,
  fetchCustomerLoyaltySnapshot,
  fetchPromoSlice
} from '../lib/realtimeFetch.js';
import { isSupabaseRealtimeEnabled, refreshRealtimeSessionFromServer } from '../lib/supabaseClient.js';
import { isNativeApp } from '../lib/platform.js';
import { subscribeLoyaltyRefresh } from '../lib/loyaltySyncBus.js';

// Müşteri ekranı — filtreli postgres dinleyicileri
export function useCustomerRealtime({
  enabled = false,
  customerId = null,
  db,
  commit
}) {
  const dbRef = useRef(db);
  dbRef.current = db;

  const debouncedLoyalty = useRef(createDebouncedTask(80));
  const debouncedHistory = useRef(createDebouncedTask(200));
  const debouncedPromos = useRef(createDebouncedTask(700));

  useEffect(() => {
    if (!enabled || !customerId || !commit) return undefined;

    let cancelled = false;
    const channelKey = `customer:${customerId}`;

    async function start() {
      const ready = await isSupabaseRealtimeEnabled();
      if (!ready || cancelled) return;

      const filter = `customer_id=eq.${customerId}`;

      await openRealtimeChannel(channelKey, (channel, listen) => {
        function refreshLoyaltyFromServer() {
          debouncedLoyalty.current(async () => {
            const loyalty = await fetchCustomerLoyaltySnapshot();
            if (!loyalty || cancelled) return;
            const current = dbRef.current;
            commit({
              ...current,
              loyalty: {
                ...(current.loyalty || {}),
                [customerId]: loyalty
              }
            }, { skipRemote: true });
          });
        }

        ['INSERT', 'UPDATE'].forEach((event) => {
          listen(channel, {
            table: 'customer_loyalty',
            event,
            filter,
            onChange: refreshLoyaltyFromServer
          });
        });

        listen(channel, {
          table: 'loyalty_events',
          event: 'INSERT',
          filter,
          onChange: () => {
            refreshLoyaltyFromServer();

            debouncedHistory.current(async () => {
              const historyRows = await fetchCustomerHistory(20);
              if (!historyRows || cancelled) return;
              const current = dbRef.current;
              const others = (current.history || []).filter((row) => Number(row.customerId) !== Number(customerId));
              commit({
                ...current,
                history: [...historyRows, ...others].slice(0, 500)
              }, { skipRemote: true });
            });
          }
        });

        ['campaigns', 'coupons'].forEach((table) => {
          listen(channel, {
            table,
            event: '*',
            onChange: () => {
              debouncedPromos.current(async () => {
                const promos = await fetchPromoSlice();
                if (!promos || cancelled) return;
                const current = dbRef.current;
                commit({
                  ...current,
                  campaigns: promos.campaigns,
                  coupons: promos.coupons,
                  dailyCampaign: promos.dailyCampaign || current.dailyCampaign
                }, { skipRemote: true });
              });
            }
          });
        });
      });
    }

    start().catch((error) => {
      console.warn('[realtime.customer]', error?.message || error);
    });

    const unsubscribeLoyaltyRefresh = subscribeLoyaltyRefresh(() => {
      refreshRealtimeSessionFromServer()
        .then(() => fetchCustomerLoyaltySnapshot())
        .then((loyalty) => {
          if (!loyalty || cancelled) return;
          const current = dbRef.current;
          commit({
            ...current,
            loyalty: {
              ...(current.loyalty || {}),
              [customerId]: loyalty
            }
          }, { skipRemote: true });
        })
        .catch(() => {});
    });

    let appListener = null;
    if (isNativeApp()) {
      import('@capacitor/app').then(({ App }) => {
        if (cancelled) return;
        App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive || cancelled) return;
          refreshRealtimeSessionFromServer().catch(() => {});
        }).then((listener) => {
          appListener = listener;
        });
      }).catch(() => {});
    }

    return () => {
      cancelled = true;
      unsubscribeLoyaltyRefresh();
      appListener?.remove?.();
      closeRealtimeChannel(channelKey).catch(() => {});
    };
  }, [enabled, customerId, commit]);
}
