import { useEffect, useState } from 'react';
import { applyBirthdayReward, cssVars, load } from './lib/db.js';
import { readSession } from './lib/session.js';
import { FIREBASE_SW_URL, refreshPushTokenIfSubscribed, startPushForegroundListener } from './lib/firebasePush.js';
import { getInitialSplashPhase, markAppSplashSeen } from './lib/appSplash.js';
import { hideNativeSplash } from './lib/nativeSplash.js';
import { useCommit } from './hooks/useCommit.js';
import AppSplash from './components/AppSplash.jsx';
import Nav from './components/Nav.jsx';
import { OfflineNotice } from './components/Cards.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import MenuPage from './pages/MenuPage.jsx';
import QrPage from './pages/QrPage.jsx';
import WheelPage from './pages/WheelPage.jsx';
import CampaignPage from './pages/CampaignPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AdminPage from './pages/AdminPage.jsx';

export default function App() {
  const [db, commit, sync, refreshRemote] = useCommit(load());
  const [session, setSession] = useState(readSession);
  const [tab, setTab] = useState('home');
  const [splashPhase, setSplashPhase] = useState(getInitialSplashPhase);

  // Açılış splash — oturumda bir kez, ~1 sn
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

  // Push service worker + ön plan dinleyici
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(FIREBASE_SW_URL).catch(() => {});
    startPushForegroundListener().catch(() => {});
  }, []);

  useEffect(() => {
    if (session) localStorage.setItem('liberteSession', JSON.stringify(session));
    else localStorage.removeItem('liberteSession');
  }, [session]);

  const customer = session
    ? (db.customers || []).find((c) => c.id === session.customerId) || (db.customers || [])[0] || null
    : null;

  useEffect(() => {
    if (!customer?.id) return;
    const next = applyBirthdayReward(db, customer.id);
    if (next !== db) commit(next);
  }, [customer?.id, customer?.birthDate]);

  useEffect(() => {
    if (!customer?.id) return;
    refreshPushTokenIfSubscribed(customer, db, commit).catch(() => {});
  }, [customer?.id]);

  // Yalnızca splash tam görünürken gizle — fade sırasında içerik altta hazır olsun
  const shellClass = splashPhase === 'visible' ? 'appShell appShell--booting' : 'appShell';
  const theme = cssVars(db.settings);

  let mainContent;
  if (!session || !customer) {
    mainContent = (
      <main className="appBoot" style={theme}>
        <LoginPage db={db} commit={commit} setSession={setSession} />
      </main>
    );
  } else {
    const card = db.loyalty[customer.id] || {};

    mainContent = (
      <main className="app" style={theme}>
        <div className="appTabView" key={tab}>
          {tab === 'home' && <HomePage db={db} customer={customer} card={card} setTab={setTab} setSession={setSession} sync={sync} refreshRemote={refreshRemote} commit={commit} />}
          {tab === 'menu' && <MenuPage db={db} />}
          {tab === 'qr' && <QrPage db={db} customer={customer} card={card} />}
          {tab === 'wheel' && <WheelPage db={db} customer={customer} commit={commit} />}
          {tab === 'campaign' && <CampaignPage db={db} customer={customer} commit={commit} />}
          {tab === 'profile' && (
            <ProfilePage
              db={db}
              customer={customer}
              card={card}
              commit={commit}
              setSession={setSession}
              setTab={setTab}
              sync={sync}
              refreshRemote={refreshRemote}
            />
          )}
          {tab === 'admin' && customer.isAdmin && <AdminPage db={db} commit={commit} />}
        </div>

        <OfflineNotice />
        <Nav tab={tab} setTab={setTab} />
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
