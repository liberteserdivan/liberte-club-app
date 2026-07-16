import { useState } from 'react';
import { apiJson } from '../lib/api.js';
import { LP_CATEGORIES } from '../lib/lp.js';

export default function CashierPage() {
  const [tokenText, setTokenText] = useState('');
  const [verified, setVerified] = useState(null);
  const [category, setCategory] = useState('coffee');
  const [count, setCount] = useState(1);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function doVerify() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { ok, data } = await apiJson('/api/n-cashier?action=verify', {
        method: 'POST',
        body: JSON.stringify({ token: tokenText })
      });
      if (!ok || !data?.ok) {
        setVerified(null);
        setError(data?.error || 'Doğrulama başarısız');
        return;
      }
      setVerified(data);
      setMessage(`${data.customer?.name || 'Üye'} — ${data.loyalty?.lpBalance ?? 0} LP`);
    } catch {
      setError('İstek zaman aşımı');
    } finally {
      setBusy(false);
    }
  }

  async function doLp(action) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { ok, data } = await apiJson('/api/n-cashier?action=lp', {
        method: 'POST',
        body: JSON.stringify({
          token: tokenText,
          action,
          category,
          count
        })
      });
      if (!ok || !data?.ok) {
        setError(data?.error || 'LP işlemi başarısız');
        return;
      }
      setVerified(data);
      setMessage(
        `${action === 'earn' ? 'Kazanım' : 'İkram'} OK — bakiye ${data.loyalty?.lpBalance ?? 0} LP`
      );
    } catch {
      setError('İstek zaman aşımı');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fade-in">
      <h1 className="brand">Kasa</h1>
      <p className="sub">QR metnini yapıştır veya okut</p>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <label htmlFor="qrToken">QR / token</label>
        <textarea
          id="qrToken"
          rows={3}
          placeholder="liberte-qr:v1...."
          value={tokenText}
          onChange={(e) => setTokenText(e.target.value)}
        />
        <button type="button" className="btn btn-primary" onClick={doVerify} disabled={busy}>
          Doğrula
        </button>
      </div>

      {verified ? (
        <div className="panel">
          <p className="sub" style={{ margin: 0 }}>{verified.customer?.name}</p>
          <p className="stat">{verified.loyalty?.lpBalance ?? 0} LP</p>
          <p className="sub">{verified.loyalty?.level}</p>

          <label htmlFor="cat">Kategori</label>
          <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {LP_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>

          <label htmlFor="cnt">Adet</label>
          <input
            id="cnt"
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
          />

          <div className="btn-row">
            <button type="button" className="btn btn-accent" disabled={busy} onClick={() => doLp('earn')}>
              LP kazan
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => doLp('redeem')}>
              İkram
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="ok">{message}</p> : null}
      {error ? <p className="err">{error}</p> : null}
    </section>
  );
}
