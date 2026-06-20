import { useCallback, useEffect, useState } from 'react';
import { reportError } from '../lib/errorHub.js';
import { fetchCustomerNotifications } from '../lib/realtimeFetch.js';

// Uygulama içi bildirim toast'ı — Realtime veya ilk yükleme
export function useInAppNotifications({ customerId = null, enabled = false }) {
  const [latest, setLatest] = useState(null);

  const showNotification = useCallback((row) => {
    if (!row?.title) return;
    setLatest(row);
    reportError({
      source: 'realtime.in_app',
      message: row.title,
      userMessage: row.body ? `${row.title} — ${row.body}` : row.title,
      level: 'info',
      showToast: true,
      persist: false
    });
  }, []);

  useEffect(() => {
    if (!enabled || !customerId) return undefined;

    let cancelled = false;

    fetchCustomerNotifications()
      .then((rows) => {
        if (cancelled || !rows?.length) return;
        showNotification(rows[0]);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [enabled, customerId, showNotification]);

  return { latest, showNotification };
}
