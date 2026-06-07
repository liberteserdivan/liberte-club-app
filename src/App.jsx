import { useEffect, useState } from 'react';
import { applyBirthdayReward, cssVars, load } from './lib/db.js';
import { bootstrapSession, logoutSession, setMemorySession } from './lib/session.js';
import { FIREBASE_SW_URL, refreshPushTokenIfSubscribed, startPushForegroundListener } from './lib/firebasePush.js';
import { getInitialSplashPhase, markAppSplashSeen } from './lib/appSplash.js';
import { hideNativeSplash } from './lib/nativeSplash.js';
import { isNativeApp } from './lib/platform.js';
import { useCommit } from './hooks/useCommit.js';
import AppSplash from './components/AppSplash.jsx';
import Nav from './components/Nav.jsx';
import AdminPinGate from './components/AdminPinGate.jsx';
import { OfflineNotice } from './components/Cards.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import MenuPage from './pages/MenuPage.jsx';
import QrPage from './pages/QrPage.jsx';
import CampaignPage from './pages/CampaignPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AdminPage from './pages/AdminPage.jsx';

export default function App() {
  const [db, commit, sync, refreshRemote] = useCommit(load());
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState('home');
  const [splashPhase, setSplashPhase] = useState(getInitialSplashPhase);

  useEffect(() => {
    bootstrapSession().then((active) => {
      if (active) setSession(active);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!session?.customerId) return;
    refreshRemote(true);
  }, [session?.customerId, refreshRemote]);

  useEffect(() => {
    if (splashPhase !== 'visible') return undefined;

    const fadeTimer = setTimeout(() => setSplashPhase('fade'), 880);
    const hideTimer = setTimeout(() => {
      markAppSplashSeen();
      setSplashPhase('hidden');
    }, 1280);
    const safetyTimer = setTimeout(() => {
      markAppSplashSeen();
      setSplashPhase('hidden');
    }, 2500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
      clearTimeout(safetyTimer);
    };
  }, [splashPhase]);

  useEffect(() => {
    if (splashPhase !== 'hidden') return;
    hideNativeSplash();
  }, [splashPhase]);

  useEffect(() => {
    // Native WebView'da service worker Capacitor yüklemesini bozabilir
    if (isNativeApp()) return;
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(FIREBASE_SW_URL).catch(() => {});
    startPushForegroundListener().catch(() => {});
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    hideNativeSplash();
  }, []);

  async function handleSetSession(next) {
    if (!next) {
      await logoutSession();
      setMemorySession(null);
      setSession(null);
      return;
    }
    setMemorySession(next);
    setSession(next);
  }

  const customer = session
    ? (db.customers || []).find((c) => c.id === session.customerId) || null
    : null;

  const isAdmin = Boolean(session?.isAdmin);
  const adminVerified = Boolean(session?.adminVerified);

  function handleAdminVerified() {
    const next = { ...session, adminVerified: true };
    setMemorySession(next);
    setSession(next);
    refreshRemote(true);
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

  const shellClass = splashPhase === 'visible' ? 'appShell appShell--booting' : 'appShell';
  const theme = cssVars(db.settings);

  let mainContent;
  if (!authReady) {
    mainContent = <main className="appBoot" style={theme} />;
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

        {isAdmin && !adminVerified && (
          <AdminPinGate fullscreen onVerified={handleAdminVerified} />
        )}

        <OfflineNotice />
        <Nav tab={tab} setTab={setTab} isAdmin={isAdmin} />
      </main>
    );
  }

  return (
    <>
      <AppSplash phase={splashPhase} />
      <div className={shellClass}>{mainContent}</div>
    </>
  );
}
