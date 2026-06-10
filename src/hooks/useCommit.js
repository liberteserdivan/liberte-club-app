import { useCallback, useEffect, useRef, useState } from 'react';
import { loadRemote, save, saveRemote } from '../lib/db.js';
import { reportError } from '../lib/errorHub.js';

// Buluttan veri çekme aralığı (ms)
const SYNC_INTERVAL_MS = 15000;

// Veritabani state'ini yerel ve bulut ile senkron tutar
export function useCommit(initial) {
  const [db, setDb] = useState(initial);
  const [mode, setMode] = useState('local');
  const [syncState, setSyncState] = useState({
    status: 'idle',
    lastError: null,
    lastOkAt: null
  });
  const lastRemoteAt = useRef(null);
  const syncing = useRef(false);
  const saveSeq = useRef(0);

  // Uzak kayıt hatasını merkezi hub'a ilet
  function handleSaveFailure(result) {
    setMode('sync-error');
    setSyncState({
      status: 'error',
      lastError: result.error || 'Kaydedilemedi',
      lastOkAt: null
    });

    reportError({
      source: 'sync.saveRemote',
      message: result.error || 'saveRemote failed',
      userMessage: result.fields
        ? 'Bu işlem için yetkin yok veya veri reddedildi.'
        : (result.error || 'Değişiklikler sunucuya kaydedilemedi. Bağlantını kontrol et.'),
      level: result.status === 403 ? 'warn' : 'error',
      code: result.network ? 'network' : `http_${result.status || 0}`,
      detail: { fields: result.fields || null },
      showToast: true,
      persist: true
    });
  }

  // Buluttan güncel veriyi çeker
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
      setSyncState((prev) => ({
        ...prev,
        status: 'synced',
        lastOkAt: Date.now()
      }));
    } catch (error) {
      reportError({
        source: 'sync.pullRemote',
        message: error?.message || 'pullRemote failed',
        userMessage: 'Güncel veriler alınamadı.',
        level: 'warn',
        showToast: false,
        persist: true
      });
    } finally {
      syncing.current = false;
    }
  }, []);

  useEffect(() => {
    pullRemote(true);
    const timer = setInterval(() => pullRemote(false), SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pullRemote]);

  // Arka planda buluta kaydet
  function queueSaveRemote(nextDb, seq) {
    setSyncState((prev) => ({ ...prev, status: 'saving', lastError: null }));

    saveRemote(nextDb).then((result) => {
      if (seq !== saveSeq.current) return;

      if (result.ok) {
        setMode('cloud');
        setSyncState({
          status: 'synced',
          lastError: null,
          lastOkAt: Date.now()
        });
        return;
      }

      if (!result.skipped) {
        handleSaveFailure(result);
      }
    });
  }

  const commit = useCallback((nextDb) => {
    saveSeq.current += 1;
    const seq = saveSeq.current;

    setDb(nextDb);
    save(nextDb);
    queueSaveRemote(nextDb, seq);
  }, []);

  // Senkron hatasından sonra tekrar dene
  const retrySave = useCallback(() => {
    saveSeq.current += 1;
    const seq = saveSeq.current;
    queueSaveRemote(db, seq);
  }, [db]);

  return [db, commit, mode, pullRemote, syncState, retrySave];
}
