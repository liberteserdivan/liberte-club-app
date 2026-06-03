import { useEffect, useState } from 'react';
import { applyBirthdayReward, cssVars, load, localDayKey } from './lib/db.js';
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
  const [db, commit, sync] = useCommit(load());
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('liberteSession') || 'null'));
  const [tab, setTab] = useState('home');
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (session) localStorage.setItem('liberteSession', JSON.stringify(session));
    else localStorage.removeItem('liberteSession');
  }, [session]);

  useEffect(() => {
    const refreshMs = 5 * 60 * 1000;
    const t = setTimeout(() => window.location.reload(), refreshMs);
    return () => clearTimeout(t);
  }, []);

  const customer = session ? (db.customers.find((c) => c.id === session.customerId) || db.customers[0]) : null;

  useEffect(() => {
    if (!customer?.id) return;
    const next = applyBirthdayReward(db, customer.id);
    if (next !== db) commit(next);
  }, [customer?.id, customer?.birthDate]);

  if (!session) {
    return <main style={cssVars(db.settings)}>
      <LoginPage db={db} commit={commit} setSession={setSession} />
    </main>;
  }

  const card = db.loyalty[customer.id] || {};
  const wheelDone = !!(db.wheelSpins || []).find((x) => x.customerId === customer.id && x.day === localDayKey());

  return <main className="app" style={cssVars(db.settings)}>
    {tab === 'home' && <HomePage db={db} customer={customer} card={card} setTab={setTab} setSession={setSession} sync={sync} installPrompt={installPrompt} setInstallPrompt={setInstallPrompt} />}
    {tab === 'menu' && <MenuPage db={db} />}
    {tab === 'qr' && <QrPage db={db} customer={customer} card={card} />}
    {tab === 'wheel' && <WheelPage db={db} customer={customer} commit={commit} />}
    {tab === 'campaign' && <CampaignPage db={db} customer={customer} commit={commit} />}
    {tab === 'admin' && customer.isAdmin && <AdminPage db={db} commit={commit} />}

    <OfflineNotice />
    <Nav tab={tab} setTab={setTab} admin={customer.isAdmin} wheelDone={wheelDone} />
  </main>;
}
