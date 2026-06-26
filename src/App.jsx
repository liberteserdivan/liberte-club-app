import { bootstrapDevAuth } from './lib/devAuth.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cssVars, load, mergeAuthSnapshot, sameCustomerId } from './lib/db.js';
import { useLocalAuth } from './lib/devAuth.js';
import { initNativeForegroundBridge, subscribeForegroundResume } from './lib/appForeground.js';
import { closeAllRealtimeChannels } from './lib/realtimeManager.js';
import { refreshRealtimeSessionFromServer } from './lib/supabaseClient.js';
import { useCustomerRealtime } from './hooks/useCustomerRealtime.js';
import { useAdminRealtime } from './hooks/useAdminRealtime.js';
import { useAdminMembers } from './hooks/useAdminMembers.js';
import { useAdminDashboardStats } from './hooks/useAdminDashboardStats.js';
import { useCustomerLoyaltyPoll } from './hooks/useCustomerLoyaltyPoll.js';
import { getMemorySession, patchMemorySession, logoutSession, setMemorySession, markAdminPinVerifiedLocally } from './lib/session.js';
import { bootstrapSessionWithTimeout } from './lib/appBootstrap.js';
import { setUnauthorizedHandler } from './lib/apiClient.js';
import { getFirebaseSwUrl, refreshPushTokenIfSubscribed, startPushForegroundListener, ensureNativePushRegistered, bindNativeTokenRefresh } from './lib/firebasePush.js';
import { ensureNativePushNavigation } from './lib/nativePush.js';
import { subscribePushNavigation, handlePushOpenPayload } from './lib/pushNavigation.js';
import { mergeAdminSnapshotIntoDb } from './lib/adminFullSnapshot.js';
import { App as CapApp } from '@capacitor/app';
import { getInitialSplashPhase } from './lib/appSplash.js';
import { hideNativeSplash } from './lib/nativeSplash.js';
import { canRequestPushOnThisDevice, deactivateDevicePushToken } from './lib/pushPrompt.js';
import { isNativeApp } from './lib/platform.js';
import { useCommit } from './hooks/useCommit.js';
import AppSplash from './components/AppSplash.jsx';
import Nav from './components/Nav.jsx';
import AdminPinGate from './components/AdminPinGate.jsx';
import { OfflineNotice } from './components/Cards.jsx';
import ErrorToastHost from './components/ErrorToastHost.jsx';
import SyncStatusBanner from './components/SyncStatusBanner.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import MenuPage from './pages/MenuPage.jsx';
import QrPage from './pages/QrPage.jsx';
import CampaignPage from './pages/CampaignPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import OnboardingOverlay, { shouldShowOnboarding } from './components/OnboardingOverlay.jsx';

const SPLASH_MIN_MS = 1000;
const SPLASH_FADE_MS = 880;
const SPLASH_TOTAL_MS = 1280;
const SPLASH_FORCE_MS = 4500;
const CUSTOMER_HYDRATE_MS = 28_000;

export default function App() {
  const sessionRef = useRef(null);
  const [tab, setTab] = useState('home');
  const [session, setSession] = useState(null);
  const [db, commit, , refreshRemote, syncState, retrySave] = useCommit(load(), sessionRef, {
    tab,
    sessionCustomerId: session?.customerId ?? null
  });
  const [authReady, setAuthReady] = useState(false);
  const [splashPhase, setSplashPhase] = useState(getInitialSplashPhase);
  const [splashImageReady, setSplashImageReady] = useState(false);
  const [adminGateSkipped, setAdminGateSkipped] = useState(false);
  const [hydratingCustomer, setHydratingCustomer] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const splashStartRef = useRef(Date.now());
  const hydrateStartedRef = useRef(0);
  const adminHydratedRef = useRef(false);
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    bootstrapDevAuth(db.customers || []).catch(() => {});
  }, [db.customers]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      // Oturumu anında kapat — yerel temizlik senkron, realtime arka planda
      logoutSession();
      setMemorySession(null);
      setSession(null);
      setAuthNotice(reason === 'expired'
        ? 'Oturumun sona erdi. Lütfen tekrar giriş yap.'
        : '');
      void closeAllRealtimeChannels().catch(() => {});
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    bootstrapSessionWithTimeout().then((result) => {
      if (result?.session) {
        setSession(result.session);
        if (result.customer) {
          commit((current) => mergeAuthSnapshot(current, {
            customer: result.customer,
            loyalty: result.loyalty
          }), { skipRemote: true });
        }
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

      // 1) UI'yi ANINDA giriş ekranına al — kullanıcı beklemesin
      logoutSession();
      setMemorySession(null);
      setSession(null);
      setAdminGateSkipped(false);

      // 2) Temizlik işlemleri arka planda (UI'yı bloklamaz)
      void (async () => {
        try {
          if (prevCustomerId) {
            await deactivateDevicePushToken(prevCustomerId, dbRef.current, commit);
          }
        } catch {
          // Çıkış akışı yine de tamamlandı
        }
        try {
          await closeAllRealtimeChannels();
        } catch {
          // Realtime kapatma hatası yoksayılır
        }
      })();
      return;
    }
    setMemorySession(next);
    setSession(next);
    setAdminGateSkipped(false);
    setAuthNotice('');
  }

  const customer = session
    ? (db.customers || []).find((c) => sameCustomerId(c.id, session.customerId)) || null
    : null;

  const isAdmin = Boolean(session?.isAdmin);
  const adminVerified = Boolean(session?.adminVerified);
  const awaitingCustomer = Boolean(session?.customerId && !customer);
  const realtimeEnabled = Boolean(session?.customerId && customer && !useLocalAuth());

  useCustomerRealtime({
    enabled: realtimeEnabled,
    customerId: customer?.id,
    db,
    commit
  });

  useCustomerLoyaltyPoll({
    enabled: realtimeEnabled,
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
    enabled: Boolean(isAdmin && adminVerified && !useLocalAuth()),
    commit,
    session,
    db
  });

  const {
    stats: adminDashboardStats,
    refreshStats: refreshAdminDashboardStats
  } = useAdminDashboardStats({
    enabled: Boolean(isAdmin && adminVerified && !useLocalAuth())
  });

  const pullAdminMembers = useCallback(() => {
    void refreshAdminMembers();
    void refreshAdminDashboardStats();
  }, [refreshAdminMembers, refreshAdminDashboardStats]);

  useAdminRealtime({
    enabled: Boolean(
      isAdmin
      && adminVerified
      && !useLocalAuth()
      && (tab === 'admin' || tab === 'qr')
    ),
    db,
    commit,
    onCustomersChanged: pullAdminMembers
  });

  // Yönetici oturumunda snapshot ile listeyi doldur ve sunucudan doğrula
  useEffect(() => {
    if (!authReady || !session?.isAdmin || !session?.adminVerified || adminHydratedRef.current) return;
    adminHydratedRef.current = true;
    const merged = mergeAdminSnapshotIntoDb(db, session);
    if (merged !== db) commit(merged, { skipRemote: true });
    pullAdminMembers();
    refreshRemote(true);
  }, [authReady, session?.isAdmin, session?.adminVerified, session?.customerId, db, commit, refreshRemote, pullAdminMembers]);

  // Yönetim sekmesi açılınca tam üye listesini yenile
  useEffect(() => {
    if (tab !== 'admin' || !isAdmin || !adminVerified) return;
    pullAdminMembers();
  }, [tab, isAdmin, adminVerified, pullAdminMembers]);

  // Push bildirimi tıklamasında uygulama içi sekme aç
  useEffect(() => {
    return subscribePushNavigation((route) => {
      const allowed = new Set(['home', 'menu', 'qr', 'campaign', 'profile', 'admin']);
      setTab(allowed.has(route) ? route : 'home');
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

    const hydrateTimer = setTimeout(() => {
      refreshRemote(true);
    }, 400);

    const failTimer = setTimeout(() => {
      setHydratingCustomer(false);
      logoutSession();
      setMemorySession(null);
      setSession(null);
      setAuthNotice('Hesap bilgilerin yüklenemedi. Lütfen tekrar giriş yap.');
    }, CUSTOMER_HYDRATE_MS);

    return () => {
      clearTimeout(hydrateTimer);
      clearTimeout(failTimer);
    };
  }, [awaitingCustomer, session?.customerId, refreshRemote]);

  useEffect(() => {
    if (!awaitingCustomer || !customer) return;
    setHydratingCustomer(false);
  }, [awaitingCustomer, customer]);

  function handleAdminVerified() {
    patchMemorySession({ adminVerified: true });
    markAdminPinVerifiedLocally();
    setSession(getMemorySession());
    setAdminGateSkipped(false);
    void refreshAdminMembers().finally(() => {
      refreshRemote(true);
    });
  }

  function handleAdminSkip() {
    setAdminGateSkipped(true);
    setTab('home');
  }

  // Yönetim paneline gidince PIN ekranını yeniden göster
  useEffect(() => {
    if (tab === 'admin' && isAdmin && !adminVerified) {
      setAdminGateSkipped(false);
    }
  }, [tab, isAdmin, adminVerified]);

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

    refreshPushTokenIfSubscribed(customer, db, commit).catch(() => {});

    if (!isNativeApp()) return undefined;

    const unbindTokenRefresh = bindNativeTokenRefresh(customer, db, commit);

    function registerNativePush() {
      ensureNativePushRegistered(customer, db, commit).catch(() => {});
    }

    registerNativePush();

    const unsubscribeResume = subscribeForegroundResume(() => {
      registerNativePush();
      refreshRealtimeSessionFromServer().catch(() => {});
    });

    return () => {
      unsubscribeResume();
      unbindTokenRefresh();
    };
  }, [customer?.id, db, commit]);

  const theme = cssVars(db.settings);
  const shellBooting = splashPhase !== 'hidden';
  const shellClass = shellBooting ? 'appShell appShell--booting' : 'appShell';

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
          {tab === 'campaign' && <CampaignPage db={db} customer={customer} commit={commit} setTab={setTab} />}
          {tab === 'profile' && (
            <ProfilePage
              db={db}
              customer={customer}
              card={card}
              commit={commit}
              setSession={handleSetSession}
              setTab={setTab}
              isAdmin={isAdmin}
              onOpenAdmin={() => {
                setAdminGateSkipped(false);
                setTab('admin');
              }}
            />
          )}
          {tab === 'admin' && isAdmin && adminVerified && (
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

        {isAdmin && !adminVerified && !adminGateSkipped && (
          <AdminPinGate fullscreen onVerified={handleAdminVerified} onSkip={handleAdminSkip} />
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
      <div className={shellClass}>{mainContent}</div>
    </>
  );
}
