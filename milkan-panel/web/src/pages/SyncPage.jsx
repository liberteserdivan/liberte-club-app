import { useState } from 'react';
import { api, downloadTeraziCsv } from '../api.js';

/** Kasa ve terazi senkron ekranı */
export default function SyncPage() {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [teraziPreview, setTeraziPreview] = useState(null);

  async function sendKasa(all) {
    setBusy('kasa');
    setMsg('');
    setErr('');
    try {
      const body = all ? {} : { ids: [] };
      const data = await api('/sync/kasa', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      setMsg(data.message || 'Kasa senkronu işaretlendi.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  async function prepareTerazi() {
    setBusy('terazi');
    setMsg('');
    setErr('');
    try {
      const data = await api('/sync/terazi', { method: 'POST' });
      setTeraziPreview(data.preview || []);
      setMsg(data.message || 'Terazi dosyası hazır.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  async function downloadTerazi() {
    setBusy('dl');
    setErr('');
    try {
      await downloadTeraziCsv();
      setMsg('Terazi PLU dosyası indirildi.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <section className="card">
        <h2>Kasaya bilgi gönder</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 0 }}>
          Stok ve fiyat değişikliklerini SmartPOS satış ekranına iletmek için kayıtları
          senkron bekliyor olarak işaretler. Sunucuda SmartPOS Yönetim açık ve
          &quot;Otomatik bilgi gönder&quot; aktif olmalıdır.
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="primary"
            disabled={busy === 'kasa'}
            onClick={() => sendKasa(true)}
          >
            {busy === 'kasa' ? 'Gönderiliyor...' : 'Tüm stokları kasaya gönder'}
          </button>
        </div>
        {msg && <div className="msg ok">{msg}</div>}
        {err && <div className="msg err">{err}</div>}
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Teraziye PLU gönder</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 0 }}>
          Tartılı ürünlerin birim fiyat listesini CSV olarak üretir. Dosyayı terazi
          programınıza veya USB ile cihaza aktarın.
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="primary"
            disabled={busy === 'terazi'}
            onClick={prepareTerazi}
          >
            {busy === 'terazi' ? 'Hazırlanıyor...' : 'Terazi listesini hazırla'}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy === 'dl'}
            onClick={downloadTerazi}
          >
            CSV indir
          </button>
        </div>

        {teraziPreview?.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PLU</th>
                  <th>Ad</th>
                  <th>Fiyat</th>
                  <th>Barkod</th>
                </tr>
              </thead>
              <tbody>
                {teraziPreview.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.adi}</td>
                    <td>{Number(row.fiyat).toFixed(2)} ₺</td>
                    <td>{row.barkod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
