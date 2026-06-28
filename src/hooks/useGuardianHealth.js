import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDetailedHealth } from '../lib/guardianClient.js';
import { usePageActive } from './usePageActive.js';

// Liberte Guardian — admin sağlık verisi hook'u
// Tek sorumluluk: detaylı sağlık verisini periyodik çekmek (sayfa aktifken).
// Sayfa arka plandayken polling durur (kaynak tasarrufu).

const DEFAULT_INTERVAL_MS = 30_000;

export default function useGuardianHealth({ enabled = true, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const active = usePageActive();
  const busyRef = useRef(false);

  // Tek seferlik sağlık çekimi
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus((prev) => (prev === 'idle' ? 'loading' : prev));
    try {
      const data = await fetchDetailedHealth();
      if (data?.ok === false && data?.needsAdminPin) {
        setError('Yönetici PIN doğrulaması gerekli.');
        setStatus('error');
        return;
      }
      setHealth(data);
      setStatus('ready');
      setError('');
    } catch (err) {
      setError(err?.message || 'Sağlık verisi alınamadı.');
      setStatus('error');
    } finally {
      busyRef.current = false;
    }
  }, []);

  // Periyodik yenileme — sayfa aktif ve etkinse
  useEffect(() => {
    if (!enabled || !active) return undefined;
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, active, intervalMs, refresh]);

  return { health, status, error, refresh };
}
