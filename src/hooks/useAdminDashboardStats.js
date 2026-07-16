import { useCallback, useEffect, useState } from 'react';
import { fetchAdminFeed } from '../lib/realtimeFetch.js';
import { usePageActive } from './usePageActive.js';
import { shouldReduceAdminDashboardRefresh, subscribeSafeMode } from '../lib/safeMode.js';

const ADMIN_STATS_INTERVAL_MS = 60_000;
const ADMIN_STATS_SAFE_INTERVAL_MS = 180_000;

// Yönetici özet — sunucudan üye ve push cihaz sayısı
export function useAdminDashboardStats({ enabled = false }) {
  const active = usePageActive();
  const [stats, setStats] = useState({ customerCount: 0, pushDeviceCount: 0 });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [safeModeTick, setSafeModeTick] = useState(0);

  useEffect(() => subscribeSafeMode(() => setSafeModeTick((n) => n + 1)), []);

  const refreshStats = useCallback(async () => {
    if (!enabled) return false;

    setStatus('loading');
    setError('');

    try {
      const feed = await fetchAdminFeed();
      if (!feed) throw new Error('Özet verisi alınamadı');

      setStats({
        customerCount: Number(feed.customerCount || 0),
        pushDeviceCount: Number(feed.pushDeviceCount || 0)
      });
      setStatus('ready');
      return true;
    } catch (e) {
      setError(e?.message || 'Özet yüklenemedi');
      setStatus('error');
      return false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setStats({ customerCount: 0, pushDeviceCount: 0 });
      setStatus('idle');
      setError('');
      return undefined;
    }

    // Arka planda/gizliyken polling yapma; ön plana dönünce tekrar başlar.
    if (!active) return undefined;

    // Özet sayaçları kritik-anlık değil; 60 sn aralık egress'i azaltır.
    refreshStats();
    const intervalMs = shouldReduceAdminDashboardRefresh()
      ? ADMIN_STATS_SAFE_INTERVAL_MS
      : ADMIN_STATS_INTERVAL_MS;
    const timer = setInterval(refreshStats, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, active, refreshStats, safeModeTick]);

  return { stats, status, error, refreshStats };
}
