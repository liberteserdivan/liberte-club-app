import { useCallback, useEffect, useRef, useState } from 'react';
import { formatClientApiError } from '../lib/apiErrors.js';
import { loadRemote, save, saveRemote } from '../lib/db.js';
import { prepareLocalState } from '../lib/localStateCache.js';
import { saveAdminSnapshot, isPartialAdminCustomerList } from '../lib/adminFullSnapshot.js';
import {
  applyAdminMemberSlice,
  mergeAdminRemoteIntoDb
} from '../lib/adminMemberSync.js';
import { fetchAdminCustomers } from '../lib/realtimeFetch.js';
import { reportError } from '../lib/errorHub.js';
import { useLocalAuth } from '../lib/devAuth.js';
import { patchMemorySession } from '../lib/session.js';
import { resolveSyncIntervalMs } from '../lib/syncPolicy.js';
import { subscribeRemoteSyncRequest } from '../lib/syncBus.js';

// Oturum yokken uzak sync yapılmaz (401 israfını önle)
function canPullRemote(sessionRef) {
  if (useLocalAuth()) return true;
  return Boolean(sessionRef?.current?.customerId);
}

// Veritabani state'ini yerel ve bulut ile senkron tutar
export function useCommit(initial, sessionRef, syncContext = {}) {
  const { tab = 'home', sessionCustomerId = null } = syncContext;
  const [db, setDb] = useState(initial);
  const [mode, setMode] = useState('local');
  const [syncState, setSyncState] = useState({
    status: 'idle',
    lastError: null,
    lastOkAt: null
  });
  const lastRemoteAt = useRef(null);
  const syncing = useRef(false);
  const savingCount = useRef(0);
  const saveSeq = useRef(0);
  const timerRef = useRef(null);
  const pageVisibleRef = useRef(
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
  );
  const syncContextRef = useRef(syncContext);
  syncContextRef.current = syncContext;

  // Oturuma göre güvenli yerel önbellek yaz
  function persistLocal(nextDb) {
    const session = sessionRef?.current || null;
    save(prepareLocalState(nextDb, {
      customerId: session?.customerId,
      isAdmin: session?.isAdmin,
      adminVerified: session?.adminVerified
    }));
  }

  // Uzak kayıt hatasını merkezi hub'a ilet
  function handleSaveFailure(result) {
    if (result.conflict) {
      pullRemoteRef.current(true);
      setSyncState((prev) => ({
        ...prev,
        status: 'synced',
        lastError: null
      }));
      return;
    }

    const formatted = formatClientApiError({
      data: { message: result.error, requestId: result.requestId },
      error: result.network ? { code: result.code || 'NETWORK_ERROR' } : null,
      fallback: result.error || 'Kaydedilemedi'
    });

    setMode('sync-error');
    setSyncState({
      status: 'error',
      lastError: formatted.message || result.error || 'Kaydedilemedi',
      lastOkAt: null
    });

    reportError({
      source: 'sync.saveRemote',
      message: result.error || 'saveRemote failed',
      userMessage: result.conflict
        ? 'Başka bir cihaz veriyi güncelledi. En güncel veriler yüklendi.'
        : result.fields
          ? 'Bu işlem için yetkin yok veya veri reddedildi.'
          : (formatted.message || result.error || 'Değişiklikler sunucuya kaydedilemedi.'),
      level: result.status === 403 ? 'warn' : 'error',
      code: result.network ? 'network' : `http_${result.status || 0}`,
      detail: { fields: result.fields || null, requestId: result.requestId || null },
      showToast: true,
      persist: true
    });
  }

  const clearSyncTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const pullRemoteRef = useRef(async () => {});

  const scheduleSyncTimer = useCallback(() => {
    clearSyncTimer();
    if (!pageVisibleRef.current) return;
    if (!canPullRemote(sessionRef)) return;

    const intervalMs = resolveSyncIntervalMs(syncContextRef.current);
    timerRef.current = setInterval(() => {
      pullRemoteRef.current(false);
    }, intervalMs);
  }, [clearSyncTimer, sessionRef]);

  // Uzak yanıt hatasını işle
  function handlePullFailure(remote) {
    if (remote?.unauthorized) return;
    if (!remote?.network) return;

    setSyncState((prev) => ({
      ...prev,
      status: 'error',
      lastError: remote.error || 'Güncel veriler alınamadı.'
    }));
  }

  // Buluttan güncel veriyi çeker
  const pullRemote = useCallback(async (force = false) => {
    if (syncing.current) return;
    if (!canPullRemote(sessionRef)) return;
    // Kayıt devam ederken eski snapshot ile üzerine yazmayı önle
    if (!force && savingCount.current > 0) return;

    syncing.current = true;
    try {
      if (!force && lastRemoteAt.current) {
        const probe = await loadRemote({ since: lastRemoteAt.current });
        if (!probe) return;
        if (probe.unauthorized) return;
        if (probe.unchanged) {
          setSyncState((prev) => ({
            ...prev,
            status: 'synced',
            lastError: null,
            lastOkAt: Date.now()
          }));
          return;
        }
        if (probe.network && !probe.data) {
          handlePullFailure(probe);
          return;
        }
      }

      const remote = await loadRemote();
      if (!remote) return;
      if (remote.unauthorized) return;
      if (remote.unchanged) {
        setSyncState((prev) => ({
          ...prev,
          status: 'synced',
          lastError: null,
          lastOkAt: Date.now()
        }));
        return;
      }
      if (!remote.data) {
        handlePullFailure(remote);
        return;
      }
      if (!force && remote.updatedAt && remote.updatedAt === lastRemoteAt.current) return;

      lastRemoteAt.current = remote.updatedAt;
      const session = sessionRef?.current;
      setDb((current) => {
        const next = mergeAdminRemoteIntoDb(current, remote.data, session);
        persistLocal(next);
        if (session?.isAdmin && session?.adminVerified) {
          saveAdminSnapshot(next);
        }
        return next;
      });

      if (session?.isAdmin && session?.adminVerified) {
        fetchAdminCustomers()
          .then((slice) => {
            if (!slice?.customers?.length) return;
            setDb((current) => {
              const next = applyAdminMemberSlice(current, slice);
              persistLocal(next);
              saveAdminSnapshot(next);
              return next;
            });
          })
          .catch(() => {});
      }

      if (
        remote.adminVerified != null
        && session
        && Boolean(session.adminVerified) !== Boolean(remote.adminVerified)
      ) {
        patchMemorySession({
          adminVerified: Boolean(remote.adminVerified),
          isAdmin: Boolean(remote.isAdmin)
        });
      }

      setMode('cloud');
      setSyncState((prev) => ({
        ...prev,
        status: 'synced',
        lastError: null,
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
  }, [sessionRef]);

  pullRemoteRef.current = pullRemote;

  // İlk açılış, sekme değişimi ve görünürlük — tam sync'i UI'dan sonra başlat
  useEffect(() => {
    if (!canPullRemote(sessionRef)) return undefined;

    const deferTimer = setTimeout(() => {
      pullRemote(true);
      scheduleSyncTimer();
    }, 120);

    function onVisibilityChange() {
      const visible = document.visibilityState === 'visible';
      pageVisibleRef.current = visible;

      if (visible) {
        pullRemote(true);
        scheduleSyncTimer();
        return;
      }

      clearSyncTimer();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearTimeout(deferTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearSyncTimer();
    };
  }, [pullRemote, scheduleSyncTimer, clearSyncTimer, sessionRef, tab, sessionCustomerId]);

  // Kasada LP sonrası manuel sync
  useEffect(() => {
    return subscribeRemoteSyncRequest((force) => {
      pullRemote(force);
    });
  }, [pullRemote]);

  // Arka planda buluta kaydet
  function queueSaveRemote(nextDb, seq) {
    const session = sessionRef?.current;
    if (isPartialAdminCustomerList(nextDb, session)) {
      pullRemoteRef.current(true);
      return;
    }

    savingCount.current += 1;
    setSyncState((prev) => ({ ...prev, status: 'saving', lastError: null }));

    saveRemote(nextDb, { baseUpdatedAt: lastRemoteAt.current }).then((result) => {
      savingCount.current = Math.max(0, savingCount.current - 1);
      if (seq !== saveSeq.current) return;

      if (result.ok) {
        if (result.updatedAt) lastRemoteAt.current = result.updatedAt;
        setMode('cloud');
        setSyncState({
          status: 'synced',
          lastError: null,
          lastOkAt: Date.now()
        });
        return;
      }

      if (result.conflict) {
        pullRemoteRef.current(true);
      }

      if (!result.skipped && !result.conflict) {
        handleSaveFailure(result);
      }
    });
  }

  const commit = useCallback((nextDb, options = {}) => {
    saveSeq.current += 1;
    const seq = saveSeq.current;

    setDb(nextDb);
    persistLocal(nextDb);
    if (!options.skipRemote) {
      queueSaveRemote(nextDb, seq);
    }
  }, []);

  // Senkron hatasından sonra tekrar dene
  const retrySave = useCallback(() => {
    saveSeq.current += 1;
    const seq = saveSeq.current;
    queueSaveRemote(db, seq);
  }, [db]);

  return [db, commit, mode, pullRemote, syncState, retrySave];
}
