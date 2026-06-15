import { useEffect, useRef, useState } from 'react';
import { applyBirthdayReward, cssVars, load } from './lib/db.js';
import { logoutSession, setMemorySession } from './lib/session.js';
import { bootstrapSessionWithTimeout } from './lib/appBootstrap.js';
import { setUnauthorizedHandler } from './lib/apiClient.js';
import { getFirebaseSwUrl, refreshPushTokenIfSubscribed, startPushForegroundListener } from './lib/firebasePush.js';
import { getInitialSplashPhase } from './lib/appSplash.js';
import { hideNativeSplash } from './lib/nativeSplash.js';
import { canRequestPushOnThisDevice } from './lib/pushPrompt.js';
import { isIos, isNativeApp } from './lib/platform.js';
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

const SPLASH_MIN_MS = 1000;
const SPLASH_FADE_MS = 880;
const SPLASH_TOTAL_MS = 1280;
const SPLASH_FORCE_MS = 4500;
const CUSTOMER_HYDRATE_MS = 8000;

export default function App() {
  const [db, commit, sync, refreshRemote, syncState, retrySave] = useCommit(load());
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState('home');
  const [splashPhase, setSplashPhase] = useState(getInitialSplashPhase);
  const [splashImageReady, setSplashImageReady] = useState(false);
  const [adminGateSkipped, setAdminGateSkipped] = useState(false);
  const [hydratingCustomer, setHydratingCustomer] = useState(false);
  const splashStartRef = useRef(Date.now());
  const hydrateStartedRef = useRef(0);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logoutSession();
      setMemorySession(null);
      setSession(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    bootstrapSessionWithTimeout().then((active) => {
      if (active) setSession(active);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!session?.customerId) return;
    refreshRemote(true);
  }, [session?.customerId, refreshRemote]);

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
    if (isNativeApp() && isIos()) return;
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(getFirebaseSwUrl()).catch(() => {});
    startPushForegroundListener().catch(() => {});
  }, []);

  async function handleSetSession(next) {
    if (!next) {
      await logoutSession();
      setMemorySession(null);
      setSession(null);
      setAdminGateSkipped(false);
      return;
    }
    setMemorySession(next);
    setSession(next);
    setAdminGateSkipped(false);
  }

  const customer = session
    ? (db.customers || []).find((c) => c.id === session.customerId) || null
    : null;

  const isAdmin = Boolean(session?.isAdmin);
  const adminVerified = Boolean(session?.adminVerified);
  const awaitingCustomer = Boolean(session?.customerId && !customer);

  // Oturum var ama müşteri henüz yüklenmediyse giriş ekranı gösterme
  useEffect(() => {
    if (!awaitingCustomer) {
      setHydratingCustomer(false);
      return undefined;
    }

    setHydratingCustomer(true);
    hydrateStartedRef.current = Date.now();
    refreshRemote(true);

    const timer = setTimeout(async () => {
      setHydratingCustomer(false);
      await logoutSession();
      setMemorySession(null);
      setSession(null);
    }, CUSTOMER_HYDRATE_MS);

    return () => clearTimeout(timer);
  }, [awaitingCustomer, session?.customerId, refreshRemote]);

  useEffect(() => {
    if (!awaitingCustomer || !customer) return;
    setHydratingCustomer(false);
  }, [awaitingCustomer, customer]);

  function handleAdminVerified() {
    const next = { ...session, adminVerified: true };
    setMemorySession(next);
    setSession(next);
    setAdminGateSkipped(false);
    refreshRemote(true);
  }

  function handleAdminSkip() {
    setAdminGateSkipped(true);
    setTab('home');
  }

  useEffect(() => {
    if (!customer?.id) return;
    const next = applyBirthdayReward(db, customer.id);
    if (next !== db) commit(next);
  }, [customer?.id, customer?.birthDate]);

  useEffect(() => {
    if (!customer?.id) return;
    refreshPushTokenIfSubscribed(customer, db, commit).catch(() => {});
  }, [customer?.id]);

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
        <LoginPage db={db} commit={commit} setSession={handleSetSession} />
      </main>
    );
  } else {
    const card = db.loyalty[customer.id] || {};

    mainContent = (
      <main className="app" style={theme}>
        <div className="appTabView" key={tab}>
          {tab === 'home' && <HomePage db={db} customer={customer} card={card} setTab={setTab} commit={commit} />}
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
          {tab === 'campaign' && <CampaignPage db={db} customer={customer} commit={commit} />}
          {tab === 'profile' && (
            <ProfilePage
              db={db}
              customer={customer}
              card={card}
              commit={commit}
              setSession={handleSetSession}
              setTab={setTab}
              isAdmin={isAdmin}
            />
          )}
          {tab === 'admin' && isAdmin && adminVerified && <AdminPage db={db} commit={commit} />}
        </div>

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
