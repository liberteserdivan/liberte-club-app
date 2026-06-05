import { useEffect, useState } from 'react';
import { applyBirthdayReward, cssVars, isWheelUnlimited, load, localDayKey } from './lib/db.js';
import { readSession } from './lib/session.js';
import { FIREBASE_SW_URL, refreshPushTokenIfSubscribed, startPushForegroundListener } from './lib/firebasePush.js';
import { useCommit } from './hooks/useCommit.js';
import Nav from './components/Nav.jsx';
import { OfflineNotice } from './components/Cards.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import MenuPage from './pages/MenuPage.jsx';
import QrPage from './pages/QrPage.jsx';
import WheelPage from './pages/WheelPage.jsx';
import CampaignPage from './pages/CampaignPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

export default function App() {
  const [db, commit, sync, refreshRemote] = useCommit(load());
  const [session, setSession] = useState(readSession);
  const [tab, setTab] = useState('home');
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

  // Geçersiz oturum — giriş ekranına düş
  if (!session || !customer) {
    return <main className="appBoot" style={cssVars(db.settings)}>
      <LoginPage db={db} commit={commit} setSession={setSession} />
    </main>;
  }

  const card = db.loyalty[customer.id] || {};
  const wheelDone = !isWheelUnlimited(db, customer)
    && !!(db.wheelSpins || []).find((x) => x.customerId === customer.id && x.day === localDayKey());

  return <main className="app" style={cssVars(db.settings)}>
    <div className="appTabView" key={tab}>
      {tab === 'home' && <HomePage db={db} customer={customer} card={card} setTab={setTab} setSession={setSession} sync={sync} refreshRemote={refreshRemote} commit={commit} />}
      {tab === 'menu' && <MenuPage db={db} />}
      {tab === 'qr' && <QrPage db={db} customer={customer} card={card} />}
      {tab === 'wheel' && <WheelPage db={db} customer={customer} commit={commit} />}
      {tab === 'campaign' && <CampaignPage db={db} customer={customer} commit={commit} />}
      {tab === 'admin' && customer.isAdmin && <AdminPage db={db} commit={commit} />}
    </div>

    <OfflineNotice />
    <Nav tab={tab} setTab={setTab} admin={customer.isAdmin} wheelDone={wheelDone} />
  </main>;
}
