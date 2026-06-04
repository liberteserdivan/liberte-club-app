import { useCallback, useEffect, useRef, useState } from 'react';
import { loadRemote, save, saveRemote } from '../lib/db.js';

// Buluttan veri çekme aralığı (ms) — kasada damga sonrası müşteri tarafında gecikmeyi azaltır
const SYNC_INTERVAL_MS = 15000;

// Veritabani state'ini yerel ve bulut ile senkron tutar
export function useCommit(initial) {
  const [db, setDb] = useState(initial);
  const [mode, setMode] = useState('local');
  const lastRemoteAt = useRef(null);
  const syncing = useRef(false);

  // Buluttan güncel veriyi çeker; admin damgası gibi değişiklikler karşı tarafa yansır
  const pullRemote = useCallback(async (force = false) => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const remote = await loadRemote();
      if (!remote) return;
      if (!force && remote.updatedAt && remote.updatedAt === lastRemoteAt.current) return;
      lastRemoteAt.current = remote.updatedAt;
      setDb(remote.data);
      save(remote.data);
      setMode('cloud');
    } finally {
      syncing.current = false;
    }
  }, []);

  useEffect(() => {
    pullRemote(true);
    const timer = setInterval(() => pullRemote(false), SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pullRemote]);

  const commit = (n) => {
    setDb(n);
    save(n);
    saveRemote(n);
    setMode('cloud');
  };

  return [db, commit, mode, pullRemote];
}
