import { useCallback, useEffect, useRef, useState } from 'react';
import { formatClientApiError } from '../lib/apiErrors.js';
import { loadRemote, save, saveRemote } from '../lib/db.js';
import { prepareLocalState } from '../lib/localStateCache.js';
import { saveAdminSnapshot, isPartialAdminCustomerList } from '../lib/adminFullSnapshot.js';
import { mergeAdminRemoteIntoDb } from '../lib/adminMemberSync.js';
import { reportError } from '../lib/errorHub.js';
import { isLocalAuth } from '../lib/devAuth.js';
import { patchMemorySession, hasAdminPinVerifiedLocally, getAuthEpoch } from '../lib/session.js';
import { resolveSyncIntervalMs } from '../lib/syncPolicy.js';
import { shouldReduceFullStatePull, shouldReducePolling, subscribeSafeMode } from '../lib/safeMode.js';
import { subscribeRemoteSyncRequest } from '../lib/syncBus.js';
import { isNativeAppActive, subscribeActiveChange } from '../lib/appForeground.js';

// Oturum yokken uzak sync yapılmaz (401 israfını önle)
function canPullRemote(sessionRef) {
  if (isLocalAuth()) return true;
  return Boolean(sessionRef?.current?.customerId);
}

// Login yanıtı zaten customer/loyalty/session döndürüyor; ilk ekran bununla
// açılır. Bu yüzden zorunlu ilk tam /api/state pull'u ertelenir (login akışını
// soğuk başlangıçta kilitlememek için). Foreground/visibility ya da periyodik
// timer daha erken senkron tetikleyebilir.
const INITIAL_REMOTE_SYNC_DELAY_MS = 6_000;

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
    // Native arka plandayken interval kurma (pil + egress tasarrufu)
    if (!isNativeAppActive()) return;
    if (!canPullRemote(sessionRef)) return;

    // Safe Mode "reduced" ise polling aralığı genişler (sunucu yükü azaltma)
    const intervalMs = resolveSyncIntervalMs({
      ...syncContextRef.current,
      safeModeReduced: shouldReducePolling()
    });
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

    // İstek başladığı andaki oturum nesli — yanıt geç gelirse (logout/login sonrası)
    // bu epoch değişmiş olur ve sonuç UI state'ine YAZILMAZ.
    const epochAtStart = getAuthEpoch();
    const isStaleAuth = () => getAuthEpoch() !== epochAtStart;

    syncing.current = true;
    try {
      if (!force && lastRemoteAt.current) {
        const probe = await loadRemote({ since: lastRemoteAt.current });
        if (isStaleAuth()) return;
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
      if (isStaleAuth()) return;
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

      // Yanıt geldiğinde oturum değiştiyse (logout/login) bu eski yanıttır —
      // yeni auth state'ini (login ekranı vb.) EZME.
      if (isStaleAuth()) return;

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

      // NOT: Admin üye listesi fan-out'u buradan kaldırıldı. Üyeler artık tek
      // kanaldan (useAdminMembers hook'u) çekiliyor; tam state pull'u sonrası
      // ayrıca members çağırmak duplicate fetch yaratıyordu.

      if (
        remote.adminVerified != null
        && session
        && Boolean(session.adminVerified) !== Boolean(remote.adminVerified)
      ) {
        const downgradingPin = Boolean(session.adminVerified)
          && !Boolean(remote.adminVerified)
          && hasAdminPinVerifiedLocally();

        if (!downgradingPin) {
          patchMemorySession({
            adminVerified: Boolean(remote.adminVerified),
            isAdmin: Boolean(remote.isAdmin)
          });
        }
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

  // Oturum veya müşteri değişince — ilk tam sync
  useEffect(() => {
    if (!canPullRemote(sessionRef)) return undefined;

    // Periyodik artımlı sync hemen kurulur (since-tabanlı, hafif).
    scheduleSyncTimer();

    // İlk zorunlu tam pull ertelenir; login response ile açılan ekranın
    // üstüne gereksiz ağır /api/state çağrısı binmesin.
    const deferTimer = setTimeout(() => {
      // Safe Mode müşteri için tam state pull'u kısar; periyodik artımlı sync
      // güncel veriyi getirmeye devam eder, ağır /api/state çağrısı atlanır.
      if (shouldReduceFullStatePull()) return;
      pullRemote(true);
    }, INITIAL_REMOTE_SYNC_DELAY_MS);

    return () => {
      clearTimeout(deferTimer);
      clearSyncTimer();
    };
  }, [pullRemote, scheduleSyncTimer, clearSyncTimer, sessionRef, sessionCustomerId]);

  // Sekme değişiminde yalnızca aralığı güncelle — tam sync tetikleme
  useEffect(() => {
    if (!canPullRemote(sessionRef)) return undefined;
    scheduleSyncTimer();
    return () => clearSyncTimer();
  }, [tab, scheduleSyncTimer, clearSyncTimer, sessionRef]);

  // Sekme görünürlüğü — arka planda sync durdur
  useEffect(() => {
    if (!canPullRemote(sessionRef)) return undefined;

    function onVisibilityChange() {
      const visible = document.visibilityState === 'visible';
      pageVisibleRef.current = visible;

      if (visible) {
        pullRemote(false);
        scheduleSyncTimer();
        return;
      }

      clearSyncTimer();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [pullRemote, scheduleSyncTimer, clearSyncTimer, sessionRef]);

  // Native ön plan/arka plan — arka planda interval durdurulur, dönüşte yenilenir
  useEffect(() => {
    if (!canPullRemote(sessionRef)) return undefined;

    return subscribeActiveChange((isActive) => {
      if (isActive) {
        pullRemote(false);
        scheduleSyncTimer();
        return;
      }
      clearSyncTimer();
    });
  }, [pullRemote, scheduleSyncTimer, clearSyncTimer, sessionRef]);

  // Safe Mode değişince polling aralığını hemen yeniden hesapla. Böylece Safe
  // Mode açıldığında müşteri istemcisinde de polling aralığı anında genişler.
  useEffect(() => {
    if (!canPullRemote(sessionRef)) return undefined;
    return subscribeSafeMode(() => { scheduleSyncTimer(); });
  }, [scheduleSyncTimer, clearSyncTimer, sessionRef]);

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

  const commit = useCallback((nextDbOrUpdater, options = {}) => {
    saveSeq.current += 1;
    const seq = saveSeq.current;

    setDb((currentDb) => {
      const nextDb = typeof nextDbOrUpdater === 'function'
        ? nextDbOrUpdater(currentDb)
        : nextDbOrUpdater;

      persistLocal(nextDb);
      if (!options.skipRemote) {
        queueSaveRemote(nextDb, seq);
      }
      return nextDb;
    });
  }, []);

  // Senkron hatasından sonra tekrar dene
  const retrySave = useCallback(() => {
    saveSeq.current += 1;
    const seq = saveSeq.current;
    queueSaveRemote(db, seq);
  }, [db]);

  return [db, commit, mode, pullRemote, syncState, retrySave];
}
