import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { apiJson } from '../lib/api.js';

const REFRESH_BEFORE_MS = 15000;

export default function MemberQrPage() {
  const canvasRef = useRef(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const { ok, data } = await apiJson('/api/n-qr?action=generate', { method: 'POST' });
      if (!ok || !data?.ok) {
        setError(data?.error || 'QR üretilemedi');
        return;
      }
      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, data.payload || data.token, {
          width: 280,
          margin: 1,
          color: { dark: '#0B2F26', light: '#FBF6EE' }
        });
      }
      setExpiresAt(Number(data.expiresAt) || 0);
    } catch {
      setError('QR isteği başarısız');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Süre dolmadan yenile
  useEffect(() => {
    if (!expiresAt) return undefined;
    const wait = Math.max(3000, expiresAt - Date.now() - REFRESH_BEFORE_MS);
    const id = setTimeout(() => { refresh(); }, wait);
    return () => clearTimeout(id);
  }, [expiresAt, refresh]);

  const secondsLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
    : 0;

  return (
    <section className="fade-in">
      <h1 className="brand">Üye QR</h1>
      <p className="sub">Kasada okut — {secondsLeft}s</p>
      <div className="qr-wrap" style={{ marginTop: '1rem' }}>
        <canvas ref={canvasRef} aria-label="Üye QR kodu" />
      </div>
      {error ? <p className="err">{error}</p> : null}
      <div style={{ marginTop: '0.85rem' }}>
        <button type="button" className="btn btn-ghost" onClick={refresh} disabled={busy}>
          {busy ? 'Yenileniyor…' : 'Yenile'}
        </button>
      </div>
    </section>
  );
}
