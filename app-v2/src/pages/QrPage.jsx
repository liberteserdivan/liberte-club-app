import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import PageHero from '../components/PageHero.jsx';
import { generateCustomerQr } from '../services/qrService.js';

export default function QrPage({ showToast }) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await generateCustomerQr();
      setToken(data.token);
    } catch (err) {
      showToast(err.message || 'QR alınamadı', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div data-testid="qr-page">
      <PageHero title="Kartım" subtitle="Kasada okutmak için QR kodun" />
      <div className="qrBox">
        {loading && <p className="muted">QR hazırlanıyor…</p>}
        {!loading && token && (
          <QRCodeSVG value={token} size={220} level="M" includeMargin />
        )}
      </div>
      <button type="button" className="btn btnPrimary" style={{ marginTop: 12 }} onClick={load} disabled={loading}>
        Yenile
      </button>
    </div>
  );
}
