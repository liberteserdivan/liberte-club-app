import { useState } from 'react';
import { apiJson } from '../lib/api.js';

export default function LoginPage({ onSuccess }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { ok, data } = await apiJson('/api/n-auth?action=login', {
        method: 'POST',
        body: JSON.stringify({ phone, pin })
      });
      if (!ok || !data?.ok) {
        setError(data?.error || 'Giriş başarısız');
        return;
      }
      onSuccess(data);
    } catch {
      setError('Bağlantı zaman aşımı');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel fade-in" onSubmit={submit}>
      <h1 className="brand">Liberte</h1>
      <p className="sub">Next — üye girişi</p>
      <div style={{ height: '1rem' }} />
      <label htmlFor="phone">Telefon</label>
      <input
        id="phone"
        inputMode="tel"
        autoComplete="tel"
        placeholder="5XXXXXXXXX"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <label htmlFor="pin">PIN</label>
      <input
        id="pin"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        placeholder="••••"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
      />
      {error ? <p className="err">{error}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Giriş…' : 'Giriş yap'}
      </button>
    </form>
  );
}
