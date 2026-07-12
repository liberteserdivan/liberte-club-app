import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import MenuPage from './pages/MenuPage.jsx';
import QrPage from './pages/QrPage.jsx';
import CampaignPage from './pages/CampaignPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import NavBar from './components/NavBar.jsx';
import Toast from './components/Toast.jsx';
import { useSessionBootstrap } from './hooks/useSession.js';
import { useAppState } from './hooks/useAppState.js';
import { useToast } from './hooks/useToast.js';
import { ensurePushIfPermitted } from './services/pushService.js';
import { CLUB_APP_NAME } from './lib/constants.js';
import { hideNativeSplash } from './lib/nativeSplash.js';

export default function App() {
  const { session, booting, setSession, logoutLocal } = useSessionBootstrap();
  const { state, customer, loyalty, loading, refresh } = useAppState(session);
  const { toast, show } = useToast();
  const [tab, setTab] = useState('home');
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    if (!session?.customerId) return undefined;
    const timer = setTimeout(() => {
      ensurePushIfPermitted(session.customerId);
    }, 1400);
    return () => clearTimeout(timer);
  }, [session?.customerId]);

  useEffect(() => {
    hideNativeSplash();
    const t = setTimeout(() => hideNativeSplash(), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!booting) hideNativeSplash();
  }, [booting]);

  if (booting) {
    return (
      <div className="bootScreen">
        <div className="loginCard" style={{ textAlign: 'center' }}>
          <div className="brandMark">{CLUB_APP_NAME}</div>
          <p className="muted">Hazırlanıyor…</p>
        </div>
      </div>
    );
  }

  if (!session?.customerId) {
    return (
      <>
        <Toast toast={toast} />
        <LoginPage onAuthed={setSession} showToast={show} />
      </>
    );
  }

  if (adminOpen) {
    return (
      <div className="appShell">
        <Toast toast={toast} />
        <div className="appScroll">
          <AdminPage
            session={session}
            setSession={setSession}
            state={state}
            showToast={show}
            onBack={() => setAdminOpen(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="appShell" data-testid="app-shell">
      <Toast toast={toast} />
      <div className="appScroll">
        {tab === 'home' && <HomePage customer={customer} loyalty={loyalty} loading={loading} />}
        {tab === 'menu' && <MenuPage state={state} />}
        {tab === 'qr' && <QrPage showToast={show} />}
        {tab === 'campaign' && <CampaignPage state={state} />}
        {tab === 'profile' && (
          <ProfilePage
            customer={customer}
            state={state}
            session={session}
            onOpenAdmin={() => setAdminOpen(true)}
            onLogout={logoutLocal}
            showToast={show}
            refresh={refresh}
          />
        )}
      </div>
      <NavBar tab={tab} onChange={setTab} />
    </div>
  );
}
