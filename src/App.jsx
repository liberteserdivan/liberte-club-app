import { bootstrapDevAuth } from './lib/devAuth.js';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { cssVars, load, mergeAuthSnapshot, sameCustomerId } from './lib/db.js';
import { isLocalAuth } from './lib/devAuth.js';
import { initNativeForegroundBridge, subscribeForegroundResume } from './lib/appForeground.js';
import { closeAllRealtimeChannels } from './lib/realtimeManager.js';
import { refreshRealtimeSessionFromServer } from './lib/supabaseClient.js';
import { useCustomerRealtime } from './hooks/useCustomerRealtime.js';
import { useAdminRealtime } from './hooks/useAdminRealtime.js';
import { useAdminMembers } from './hooks/useAdminMembers.js';
import { useAdminDashboardStats } from './hooks/useAdminDashboardStats.js';
import { useCustomerLoyaltyPoll } from './hooks/useCustomerLoyaltyPoll.js';
import { useCustomerNotificationsPoll } from './hooks/useCustomerNotificationsPoll.js';
import { getMemorySession, logoutSession, getAuthEpoch } from './lib/session.js';
import { bootstrapSessionWithTimeout } from './lib/appBootstrap.js';
import { setUnauthorizedHandler } from './lib/apiClient.js';
import { setGuardianRole } from './lib/guardianTelemetry.js';
import { getFirebaseSwUrl, ensurePushRegisteredIfPermitted, startPushForegroundListener, bindNativeTokenRefresh } from './lib/firebasePush.js';
import { ensureNativePushNavigation } from './lib/nativePush.js';
import { subscribePushNavigation, subscribePushMessageOpen, handlePushOpenPayload } from './lib/pushNavigation.js';
import { mergeAdminSnapshotIntoDb } from './lib/adminFullSnapshot.js';
import { App as CapApp } from '@capacitor/app';
import { getInitialSplashPhase } from './lib/appSplash.js';
import { hideNativeSplash } from './lib/nativeSplash.js';
import { canRequestPushOnThisDevice, deactivateDevicePushToken } from './lib/pushPrompt.js';
import { isNativeApp } from './lib/platform.js';
import { useCommit } from './hooks/useCommit.js';
import { isRealtimeDisabledByFlag } from './lib/safeMode.js';
import AppSplash from './components/AppSplash.jsx';
import Nav from './components/Nav.jsx';
import { OfflineNotice } from './components/Cards.jsx';
import ErrorToastHost from './components/ErrorToastHost.jsx';
import SyncStatusBanner from './components/SyncStatusBanner.jsx';
import useGuardianSafeMode from './hooks/useGuardianSafeMode.js';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import MenuPage from './pages/MenuPage.jsx';
import QrPage from './pages/QrPage.jsx';
import CampaignPage from './pages/CampaignPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
// Admin paneli büyük; sadece yönetici açınca yüklensin (müşteri açılışını hızlandırır)
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
import PushMessageSheet from './components/PushMessageSheet.jsx';
import OnboardingOverlay, { shouldShowOnboarding } from './components/OnboardingOverlay.jsx';

// PERF: Backend artık hızlı (fra1 + paralel sorgular) olduğundan splash'i soğuk
// başlangıcı gizlemek için uzun tutmaya gerek yok. Süreler kısaltıldı: yapay
// bekleme ~2sn'den ~0.66sn'ye indi. Fade boşluğu (TOTAL - FADE = 420ms) CSS'teki
// `.appSplash` opacity geçişiyle (0.42s) bilinçli olarak eşleşir; pürüzsüz kalır.
const SPLASH_MIN_MS = 200;
const SPLASH_FADE_MS = 240;
const SPLASH_TOTAL_MS = 660;
const SPLASH_FORCE_MS = 4500;
const CUSTOMER_HYDRATE_MS = 18_000;
const CUSTOMER_HYDRATE_RETRY_MS = 3_500;

export default function App() {
  const sessionRef = useRef(null);
  const [tab, setTab] = useState('home');
  const [session, setSession] = useState(null);
  // sessionRef'i render sırasında senkron güncelle. Aksi halde logout sonrası
  // yeniden render'da useCommit'in effect'i (sessionRef güncelleyen effect'ten
  // ÖNCE çalışır) bayat session görüp login ekranında /api/state tetikleyebilir.
  sessionRef.current = session;
  const [db, commit, , refreshRemote, syncState, retrySave, resetDb] = useCommit(load(), sessionRef, {
    tab,
    sessionCustomerId: session?.customerId ?? null
  });
  const [authReady, setAuthReady] = useState(false);
  const [splashPhase, setSplashPhase] = useState(getInitialSplashPhase);
  const [splashImageReady, setSplashImageReady] = useState(false);
  const [hydratingCustomer, setHydratingCustomer] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pushMessage, setPushMessage] = useState(null);
  const splashStartRef = useRef(Date.now());
  const hydrateStartedRef = useRef(0);
  const adminHydratedRef = useRef(false);
  const bootstrapSnapshotRef = useRef(null);
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    bootstrapDevAuth(db.customers || []).catch(() => {});
  }, [db.customers]);

  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      // Zaten oturum yoksa (login ekranı) arka plandan gelen 401 hiçbir şeyi
      // tetiklemesin — eski in-flight isteğin 401'i login UI'ını bozmamalı.
      if (!getMemorySession()) return;
      logoutSession();
      resetDb();
      setSession(null);
      setAuthNotice(reason === 'expired'
        ? 'Oturumun sona erdi. Lütfen tekrar giriş yap.'
        : '');
      void closeAllRealtimeChannels().catch(() => {});
    });
    return () => setUnauthorizedHandler(null);
  }, [resetDb]);

  useEffect(() => {
    bootstrapSessionWithTimeout().then((result) => {
      const live = getMemorySession();
      if (live) {
        // Login bootstrap'tan önce bittiyse geç gelen bootstrap UI'yı ezmesin
        setSession(live);
      } else if (result?.session) {
        setSession(result.session);
        if (result.customer) {
          bootstrapSnapshotRef.current = {
            customer: result.customer,
            loyalty: result.loyalty || null
          };
          commit((current) => mergeAuthSnapshot(current, {
            customer: result.customer,
            loyalty: result.loyalty
          }), { skipRemote: true });
        }
      } else if (result?.sessionUnavailable) {
        // Oturum ön kontrolü geçici başarısız — giriş formu açık kalsın
        setAuthNotice(result.message || 'Oturum şu an doğrulanamıyor. Giriş yapmayı deneyebilirsiniz.');
      }
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!splashImageReady) return;
    hideNativeSplash();
  }, [splashImageReady]);

  useEffect(() => {
    if (splashPhase !== 'fade' && splashPhase !== 'hidden') return;
    hideNativeSplash();
  }, [splashPhase]);

  useEffect(() => {
    if (!authReady || splashPhase !== 'visible') return undefined;

    const elapsed = Date.now() - splashStartRef.current;
    const delay = Math.max(0, SPLASH_MIN_MS - elapsed);

    const fadeTimer = setTimeout(() => setSplashPhase('fade'), delay + SPLASH_FADE_MS);
    const hideTimer = setTimeout(() => setSplashPhase('hidden'), delay + SPLASH_TOTAL_MS);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [authReady, splashPhase]);

  useEffect(() => {
    const forceTimer = setTimeout(() => {
      setAuthReady(true);
      setSplashPhase('hidden');
      hideNativeSplash();
      document.body.classList.add('app-ui-ready');
    }, SPLASH_FORCE_MS);

    return () => clearTimeout(forceTimer);
  }, []);

  useEffect(() => {
    if (!authReady || splashPhase !== 'hidden') return;
    document.body.classList.add('app-ui-ready');
  }, [authReady, splashPhase]);

  useEffect(() => {
    // Native uygulamada web push SW kaydı yapma — TestFlight/Safari çakışmasını önler
    if (isNativeApp()) return;
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(getFirebaseSwUrl()).catch(() => {});
    startPushForegroundListener().catch(() => {});
  }, []);

  function handleSetSession(next) {
    if (!next) {
      const prevCustomerId = customer?.id || null;
      const epochAtLogout = getAuthEpoch();

      // 1) UI'yi ANINDA giriş ekranına al — bellek + storage + React db sıfırlanır
      logoutSession();
      resetDb();
      setSession(null);
      adminHydratedRef.current = false;

      // 2) Temizlik arka planda — logout sonrası commit/state yazımı YOK
      void (async () => {
        if (getAuthEpoch() !== epochAtLogout) return;
        try {
          if (prevCustomerId) {
            await deactivateDevicePushToken(prevCustomerId);
          }
        } catch {
          // Çıkış akışı yine de tamamlandı
        }
        if (getAuthEpoch() !== epochAtLogout) return;
        try {
          await closeAllRealtimeChannels();
        } catch {
          // Realtime kapatma hatası yoksayılır
        }
      })();
      return;
    }
    setSession(next);
    setAuthNotice('');
  }

  const customer = session
    ? (db.customers || []).find((c) => sameCustomerId(c.id, session.customerId)) || null
    : null;

  const isAdmin = Boolean(session?.isAdmin);
  const adminVerified = isAdmin || Boolean(session?.adminVerified);

  // Guardian telemetrisi için aktif kullanıcı rolünü bildir (anonymous/customer/admin)
  useEffect(() => {
    if (isAdmin) setGuardianRole('admin');
    else if (session?.customerId) setGuardianRole('customer');
    else setGuardianRole('anonymous');
  }, [isAdmin, session?.customerId]);

  const awaitingCustomer = Boolean(session?.customerId && !customer);
  const realtimeEnabled = Boolean(session?.customerId && customer && !isLocalAuth());
  // Admin sekmesinde musteri arka plan sync'i kapat — DB/API yukunu azaltir
  const customerBackgroundSyncEnabled = realtimeEnabled && tab !== 'admin';

  useCustomerRealtime({
    enabled: customerBackgroundSyncEnabled,
    customerId: customer?.id,
    db,
    commit
  });

  useCustomerLoyaltyPoll({
    enabled: customerBackgroundSyncEnabled,
    customerId: customer?.id,
    db,
    commit
  });

  useCustomerNotificationsPoll({
    enabled: customerBackgroundSyncEnabled,
    customerId: customer?.id,
    db,
    commit
  });

  const {
    members: adminMembers,
    status: adminMembersStatus,
    error: adminMembersError,
    refreshMembers: refreshAdminMembers
  } = useAdminMembers({
    enabled: Boolean(isAdmin && adminVerified && !isLocalAuth()),
    commit,
    session,
    db
  });

  const {
    stats: adminDashboardStats,
    refreshStats: refreshAdminDashboardStats
  } = useAdminDashboardStats({
    enabled: Boolean(isAdmin && adminVerified && !isLocalAuth())
  });

  const pullAdminMembers = useCallback(() => {
    void refreshAdminMembers();
    void refreshAdminDashboardStats();
  }, [refreshAdminMembers, refreshAdminDashboardStats]);

  useAdminRealtime({
    enabled: Boolean(
      isAdmin
      && adminVerified
      && !isLocalAuth()
      && !isRealtimeDisabledByFlag()
      && (tab === 'admin' || tab === 'qr')
    ),
    db,
    commit,
    onCustomersChanged: pullAdminMembers
  });

  // Yönetici oturumunda snapshot ile listeyi doldur; sunucu sync'i geciktir.
  // STABİLİTE: useAdminMembers zaten üye listesini çeker — burada tekrar tetikleme.
  // refreshRemote + admin-members + guardian aynı anda DB bağlantısı açmasın.
  useEffect(() => {
    if (!authReady || !isAdmin || !adminVerified || adminHydratedRef.current) return;
    adminHydratedRef.current = true;
    const merged = mergeAdminSnapshotIntoDb(db, session);
    if (merged !== db) commit(merged, { skipRemote: true });
    const syncTimer = setTimeout(() => refreshRemote(true), 2500);
    return () => clearTimeout(syncTimer);
  }, [authReady, isAdmin, adminVerified, session?.customerId, db, commit, refreshRemote]);

  // Yönetim sekmesine geçince listeyi yenile — ilk açılışta useAdminMembers zaten çeker,
  // burada kısa gecikme ile tekrar (çift istek fırtınasını önler).
  useEffect(() => {
    if (tab !== 'admin' || !isAdmin || !adminVerified) return undefined;
    const timer = setTimeout(() => pullAdminMembers({ manual: true }), 1500);
    return () => clearTimeout(timer);
  }, [tab, isAdmin, adminVerified, pullAdminMembers]);

  // Push bildirimi tıklamasında uygulama içi sekme aç
  useEffect(() => {
    return subscribePushNavigation((route) => {
      const allowed = new Set(['home', 'menu', 'qr', 'campaign', 'profile', 'admin']);
      setTab(allowed.has(route) ? route : 'home');
    });
  }, []);

  // Push mesajını uygulama içinde tam metin olarak göster
  useEffect(() => {
    return subscribePushMessageOpen((message) => {
      if (!message?.title && !message?.body) return;
      setPushMessage(message);
    });
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let disposed = false;
    let removeOpenListener = () => {};

    CapApp.getLaunchUrl()
      .then((result) => {
        if (!disposed && result?.url) handlePushOpenPayload({ url: result.url });
      })
      .catch(() => {});

    CapApp.addListener('appUrlOpen', (event) => {
      handlePushOpenPayload({ url: event.url });
    }).then((handle) => {
      removeOpenListener = () => { handle.remove(); };
    }).catch(() => {});

    return () => {
      disposed = true;
      removeOpenListener();
    };
  }, []);

  // Oturum var ama müşteri henüz yüklenmediyse — giriş yanıtındaki snapshot öncelikli
  useEffect(() => {
    if (!awaitingCustomer) {
      setHydratingCustomer(false);
      return undefined;
    }

    setHydratingCustomer(true);
    hydrateStartedRef.current = Date.now();

    const hydrateCustomerId = session?.customerId;
    const hydrateTimer = setTimeout(() => {
      refreshRemote(true);
    }, 400);

    const failTimer = setTimeout(() => {
      const active = getMemorySession();
      if (!active || active.customerId !== hydrateCustomerId) return;

      const snapshot = bootstrapSnapshotRef.current;
      if (snapshot?.customer?.id === hydrateCustomerId) {
        commit((current) => mergeAuthSnapshot(current, snapshot), { skipRemote: true });
      } else {
        commit((current) => mergeAuthSnapshot(current, {
          customer: {
            id: hydrateCustomerId,
            name: 'Üye',
            phone: '',
            email: '',
            isAdmin: Boolean(active.isAdmin)
          }
        }), { skipRemote: true });
      }

      setHydratingCustomer(false);
      setAuthNotice('Hesap bilgileri şu an tam senkronize edilemedi. Önbellekteki verilerle devam ediliyor.');
    }, CUSTOMER_HYDRATE_RETRY_MS);

    return () => {
      clearTimeout(hydrateTimer);
      clearTimeout(failTimer);
    };
  }, [awaitingCustomer, session?.customerId, refreshRemote, resetDb]);

  useEffect(() => {
    if (!awaitingCustomer || !customer) return;
    setHydratingCustomer(false);
  }, [awaitingCustomer, customer]);

  useEffect(() => {
    if (!customer?.id) {
      setShowOnboarding(false);
      return;
    }
    setShowOnboarding(shouldShowOnboarding(customer.id));
  }, [customer?.id]);

  useEffect(() => {
    if (!isNativeApp()) return;
    ensureNativePushNavigation();
    initNativeForegroundBridge();
  }, []);

  useEffect(() => {
    if (!customer?.id) return undefined;

    // Push kaydı giriş/state sync'ten SONRA — açılışta DB bağlantısı yarışmasın
    const pushDelayMs = isNativeApp() ? 1200 : 800;
    function syncPushRegistration() {
      ensurePushRegisteredIfPermitted(customer, db, commit).catch(() => {});
    }

    const pushTimer = setTimeout(syncPushRegistration, pushDelayMs);

    if (!isNativeApp()) return () => clearTimeout(pushTimer);

    const unbindTokenRefresh = bindNativeTokenRefresh(customer, db, commit);
    const registerTimer = setTimeout(syncPushRegistration, pushDelayMs);

    const unsubscribeResume = subscribeForegroundResume(() => {
      syncPushRegistration();
      refreshRealtimeSessionFromServer().catch(() => {});
    });

    return () => {
      clearTimeout(pushTimer);
      clearTimeout(registerTimer);
      unsubscribeResume();
      unbindTokenRefresh();
    };
  }, [customer?.id, db, commit]);

  const theme = cssVars(db.settings);
  const shellBooting = splashPhase !== 'hidden';
  const shellClass = shellBooting ? 'appShell appShell--booting' : 'appShell';
  const safeModeState = useGuardianSafeMode();
  const maintenanceNotice = String(safeModeState?.maintenanceMessage || '').trim();

  let mainContent;
  if (!authReady) {
    mainContent = <main className="appBoot" style={theme} aria-busy="true" aria-hidden="true" />;
  } else if (awaitingCustomer && hydratingCustomer) {
    mainContent = (
      <main className="appBoot appBoot--hydrate" style={theme} aria-busy="true">
        <p className="appBootHint">Hesabın yükleniyor…</p>
      </main>
    );
  } else if (!session || !customer) {
    mainContent = (
      <main className="appBoot" style={theme}>
        {authNotice && <p className="appBootHint appBootNotice">{authNotice}</p>}
        <LoginPage db={db} commit={commit} setSession={handleSetSession} />
      </main>
    );
  } else {
    const card = db.loyalty[customer.id] || {};

    mainContent = (
      <main className="app" style={theme}>
        <div className="appTabView" key={tab}>
          {tab === 'home' && (
            <HomePage
              db={db}
              customer={customer}
              card={card}
              setTab={setTab}
              commit={commit}
              pushBannerDeferred={showOnboarding}
            />
          )}
          {tab === 'menu' && <MenuPage db={db} />}
          {tab === 'qr' && (
            <QrPage
              db={db}
              customer={customer}
              card={card}
              commit={commit}
              refreshRemote={refreshRemote}
              isAdmin={isAdmin}
              adminVerified={adminVerified}
            />
          )}
          {tab === 'campaign' && (
            <CampaignPage
              db={db}
              customer={customer}
              commit={commit}
              setTab={setTab}
              onOpenMessage={setPushMessage}
            />
          )}
          {tab === 'profile' && (
            <ProfilePage
              db={db}
              customer={customer}
              card={card}
              commit={commit}
              setSession={handleSetSession}
              setTab={setTab}
              isAdmin={isAdmin}
              onOpenAdmin={() => setTab('admin')}
            />
          )}
          {tab === 'admin' && isAdmin && adminVerified && (
            <Suspense fallback={<div className="appShell__lazyFallback">Panel yükleniyor…</div>}>
              <AdminPage
                db={db}
                commit={commit}
                refreshRemote={refreshRemote}
                adminMembers={adminMembers}
                adminMembersStatus={adminMembersStatus}
                adminMembersError={adminMembersError}
                onRefreshMembers={refreshAdminMembers}
                adminDashboardStats={adminDashboardStats}
              />
            </Suspense>
          )}
        </div>

        {showOnboarding && (
          <OnboardingOverlay
            customerId={customer.id}
            customer={customer}
            db={db}
            commit={commit}
            onDone={() => setShowOnboarding(false)}
          />
        )}

        <SyncStatusBanner syncState={syncState} onRetry={retrySave} />
        <ErrorToastHost />
        <OfflineNotice />
        <Nav tab={tab} setTab={setTab} isAdmin={isAdmin} />
      </main>
    );
  }

  return (
    <>
      <AppSplash phase={splashPhase} onImageReady={() => setSplashImageReady(true)} />
      {maintenanceNotice && splashPhase === 'hidden' && (
        <div className="guardianMaintBanner" role="status">{maintenanceNotice}</div>
      )}
      <div className={shellClass}>{mainContent}</div>
      {pushMessage && (
        <PushMessageSheet message={pushMessage} onClose={() => setPushMessage(null)} />
      )}
    </>
  );
}
