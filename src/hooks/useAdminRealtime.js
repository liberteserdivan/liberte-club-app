import { useEffect, useRef } from 'react';
import {
  closeRealtimeChannel,
  createDebouncedTask,
  openRealtimeChannel
} from '../lib/realtimeManager.js';
import { fetchAdminFeed } from '../lib/realtimeFetch.js';
import { isSupabaseRealtimeEnabled } from '../lib/supabaseClient.js';

// Admin panel — yalnızca admin PIN doğrulandığında açılır
export function useAdminRealtime({
  enabled = false,
  db,
  commit,
  onFeedUpdate,
  onCustomersChanged
}) {
  const dbRef = useRef(db);
  dbRef.current = db;
  const debouncedFeed = useRef(createDebouncedTask(500));

  useEffect(() => {
    if (!enabled || !commit) return undefined;

    let cancelled = false;
    const channelKey = 'admin:feed';

    async function refreshFeed() {
      debouncedFeed.current(async () => {
        const feed = await fetchAdminFeed();
        if (!feed || cancelled) return;
        const current = dbRef.current;
        commit({
          ...current,
          history: feed.recentEvents || current.history || [],
          pushLog: feed.recentPushLog?.length
            ? feed.recentPushLog.map((row) => ({
              id: row.id,
              title: row.title,
              body: row.body,
              audience: row.audience,
              sent: row.sent_count,
              createdAt: row.created_at
            }))
            : (current.pushLog || [])
        }, { skipRemote: true });
        onFeedUpdate?.(feed);
      });
    }

    async function start() {
      const ready = await isSupabaseRealtimeEnabled();
      if (!ready || cancelled) return;

      await openRealtimeChannel(channelKey, (channel, listen) => {
        listen(channel, {
          table: 'customers',
          event: 'INSERT',
          onChange: () => {
            onCustomersChanged?.();
            refreshFeed();
          }
        });

        ['loyalty_events', 'in_app_notifications', 'push_send_log'].forEach((table) => {
          listen(channel, {
            table,
            event: 'INSERT',
            onChange: refreshFeed
          });
        });
      });
    }

    start().catch((error) => {
      console.warn('[realtime.admin]', error?.message || error);
    });

    return () => {
      cancelled = true;
      closeRealtimeChannel(channelKey).catch(() => {});
    };
  }, [enabled, commit, onFeedUpdate, onCustomersChanged]);
}
