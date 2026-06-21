import { useEffect, useState } from 'react';
import { api, clearToken, hasToken, saveToken } from './api.js';
import LoginPage from './pages/LoginPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import BulkPricePage from './pages/BulkPricePage.jsx';
import SyncPage from './pages/SyncPage.jsx';

const TABS = [
  { id: 'products', label: 'Ürünler' },
  { id: 'prices', label: 'Toplu Fiyat' },
  { id: 'sync', label: 'Kasa & Terazi' }
];

/** Ana uygulama kabuğu */
export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  const [tab, setTab] = useState('products');
  const [health, setHealth] = useState(null);

  useEffect(() => {
    if (!authed) return;
    api('/health')
      .then(setHealth)
      .catch(() => setHealth(null));
  }, [authed]);

  async function handleLogin(pin) {
    const { token } = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ pin })
    });
    saveToken(token);
    setAuthed(true);
  }

  function handleLogout() {
    clearToken();
    setAuthed(false);
  }

  if (!authed) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Milkan Panel</h1>
          <p>SmartPOS stok · fiyat · terazi</p>
        </div>
        <button type="button" className="ghost" onClick={handleLogout}>
          Çıkış
        </button>
      </header>

      <div className="status-bar">
        <span className={`pill ${health?.database?.ok ? 'ok' : 'warn'}`}>
          {health?.mock
            ? 'Demo mod (MOCK)'
            : health?.database?.ok
              ? `SQL: ${health.database.server}`
              : 'SQL bağlantısı yok'}
        </span>
        {health?.database?.database && (
          <span className="pill">{health.database.database}</span>
        )}
      </div>

      <nav className="nav-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'products' && <ProductsPage />}
      {tab === 'prices' && <BulkPricePage />}
      {tab === 'sync' && <SyncPage />}
    </div>
  );
}
