import { useCallback, useState } from 'react';

// Uygulama içi bildirimler yalnızca Bildirim Merkezi listesinde gösterilir — push ile çift toast yok
export function useInAppNotifications({ customerId = null, enabled = false } = {}) {
  const [latest, setLatest] = useState(null);

  const showNotification = useCallback((row) => {
    if (!row?.title) return;
    setLatest(row);
  }, []);

  void customerId;
  void enabled;

  return { latest, showNotification };
}
