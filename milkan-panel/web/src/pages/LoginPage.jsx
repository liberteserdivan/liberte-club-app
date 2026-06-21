import { useState } from 'react';

/** PIN ile giriş ekranı */
export default function LoginPage({ onLogin }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onLogin(pin);
    } catch (err) {
      setError(err.message || 'Giriş başarısız');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h2>Milkan Panel</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Stok, fiyat ve terazi yönetimi
        </p>
        <label style={{ marginTop: '1rem' }}>
          PIN
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Panel PIN"
            autoFocus
          />
        </label>
        <div className="btn-row">
          <button type="submit" className="primary" disabled={busy || pin.length < 4}>
            {busy ? 'Giriş...' : 'Giriş yap'}
          </button>
        </div>
        {error && <div className="msg err">{error}</div>}
      </form>
    </div>
  );
}
