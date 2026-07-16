import { useCallback, useEffect, useState } from 'react';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import MemberQrPage from './pages/MemberQrPage.jsx';
import CashierPage from './pages/CashierPage.jsx';
import { apiJson } from './lib/api.js';
import {
  applyAuthResult,
  logoutLocal,
  restoreLocalSession
} from './lib/session.js';

const initial = restoreLocalSession();

export default function App() {
  const [auth, setAuth] = useState(initial);
  const [tab, setTab] = useState('home');
  const [booting, setBooting] = useState(Boolean(initial));

  // Arka planda oturum doğrula — hata/cancel sonrası booting asla kilitlenmez
  useEffect(() => {
    let cancelled = false;
    async function revalidate() {
      try {
        if (!auth?.token) return;
        const { ok, data } = await apiJson('/api/n-auth?action=me');
        if (cancelled) return;
        if (!ok || !data?.ok) {
          logoutLocal();
          setAuth(null);
        } else {
          setAuth(applyAuthResult({ ...data, sessionToken: auth.token }));
        }
      } catch {
        // Ağ hatası: yerel oturumu koru, boot kilidini bırak
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    revalidate();
    return () => { cancelled = true; };
  }, []);

  async function handleLogin(result) {
    setAuth(applyAuthResult(result));
    setTab('home');
  }

  async function handleLogout() {
    try {
      await apiJson('/api/n-auth?action=logout', { method: 'POST' });
    } catch {
      // yerel çıkış yine yapılır
    }
    logoutLocal();
    setAuth(null);
  }

  // Stable callback — HomePage /me döngüsünü önler (BUG-014)
  const handleLoyalty = useCallback((loyalty) => {
    setAuth((prev) => (prev ? { ...prev, loyalty } : prev));
  }, []);

  if (!auth) {
    return (
      <div className="app-shell fade-in">
        <LoginPage onSuccess={handleLogin} />
      </div>
    );
  }

  const isAdmin = Boolean(auth.isAdmin);

  return (
    <div className="app-shell fade-in">
      {booting ? <p className="sub">Oturum kontrol ediliyor…</p> : null}
      {tab === 'home' ? (
        <HomePage
          auth={auth}
          onLogout={handleLogout}
          onLoyalty={handleLoyalty}
        />
      ) : null}
      {tab === 'qr' ? <MemberQrPage /> : null}
      {tab === 'cashier' && isAdmin ? <CashierPage /> : null}

      <nav className="tabs" aria-label="Ana sekmeler">
        <button
          type="button"
          className={`tab ${tab === 'home' ? 'active' : ''}`}
          onClick={() => setTab('home')}
        >
          Ana
        </button>
        <button
          type="button"
          className={`tab ${tab === 'qr' ? 'active' : ''}`}
          onClick={() => setTab('qr')}
        >
          QR
        </button>
        {isAdmin ? (
          <button
            type="button"
            className={`tab ${tab === 'cashier' ? 'active' : ''}`}
            onClick={() => setTab('cashier')}
          >
            Kasa
          </button>
        ) : (
          <span className="tab" aria-hidden="true" />
        )}
      </nav>
    </div>
  );
}
