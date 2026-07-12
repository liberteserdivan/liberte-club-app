import { useEffect, useState } from 'react';
import PageHero from '../components/PageHero.jsx';
import { verifyAdminPin } from '../services/authService.js';
import { fetchMembers, sendPush, fetchHealth } from '../services/adminService.js';
import { applyLoyaltyAction, verifyScannedQr } from '../services/qrService.js';
import { formatPinInput } from '../lib/phoneMask.js';

const TABS = [
  { id: 'summary', label: 'Özet' },
  { id: 'members', label: 'Üyeler' },
  { id: 'menu', label: 'Menü' },
  { id: 'campaign', label: 'Kampanya' },
  { id: 'health', label: 'Sağlık' }
];

export default function AdminPage({ session, setSession, state, showToast, onBack }) {
  const [tab, setTab] = useState('summary');
  const [pin, setPin] = useState('');
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [scanToken, setScanToken] = useState('');
  const [health, setHealth] = useState(null);
  const verified = Boolean(session?.adminVerified);

  async function unlock() {
    setLoading(true);
    try {
      await verifyAdminPin(pin);
      setSession({ ...session, adminVerified: true });
      showToast('Yönetici doğrulandı');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadMembers() {
    setLoading(true);
    try {
      const data = await fetchMembers();
      setMembers(data.members || data.customers || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (verified && tab === 'members') loadMembers();
  }, [verified, tab]);

  useEffect(() => {
    if (verified && tab === 'health') {
      fetchHealth().then(setHealth).catch(() => setHealth({ ok: false }));
    }
  }, [verified, tab]);

  async function stampMember(customerId) {
    try {
      await applyLoyaltyAction({ customerId, action: 'stamp' });
      showToast('Damga eklendi');
      loadMembers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function onSendPush() {
    try {
      await sendPush({ title: pushTitle, body: pushBody, audience: 'all' });
      showToast('Bildirim gönderildi');
      setPushTitle('');
      setPushBody('');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function onVerifyQr() {
    try {
      const data = await verifyScannedQr(scanToken.trim());
      showToast(data.customer?.name ? `OK: ${data.customer.name}` : 'QR doğrulandı');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (!verified) {
    return (
      <div>
        <PageHero title="Yönetici" subtitle="PIN ile devam" />
        <div className="card">
          <label>Yönetici PIN</label>
          <input type="password" value={pin} onChange={(e) => setPin(formatPinInput(e.target.value))} />
          <button type="button" className="btn btnPrimary" disabled={loading} onClick={unlock}>
            {loading ? 'Kontrol…' : 'Giriş'}
          </button>
          <button type="button" className="ghost" onClick={onBack}>Geri</button>
        </div>
      </div>
    );
  }

  const products = state?.products || [];

  return (
    <div data-testid="admin-page">
      <PageHero title="Yönetim" subtitle="Liberte Club admin" />
      <div className="adminTabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="card">
          <b>Özet</b>
          <p className="muted">Ürün: {products.length} · Üye listesi Üyeler sekmesinde</p>
          <label>QR token doğrula</label>
          <input value={scanToken} onChange={(e) => setScanToken(e.target.value)} placeholder="Taranan token" />
          <button type="button" className="btn btnPrimary" onClick={onVerifyQr}>Doğrula</button>
          <button type="button" className="ghost" onClick={onBack}>Uygulamaya dön</button>
        </div>
      )}

      {tab === 'members' && (
        <div className="card">
          <b>Üyeler {loading ? '…' : `(${members.length})`}</b>
          {members.slice(0, 40).map((m) => (
            <div className="memberRow" key={m.id}>
              <div>
                <strong>{m.name}</strong>
                <div className="muted">{m.phone}</div>
              </div>
              <button type="button" className="btn btnPrimary" style={{ width: 'auto', margin: 0 }} onClick={() => stampMember(m.id)}>
                + Damga
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'menu' && (
        <div className="card">
          <b>Menü (salt okunur v1)</b>
          <p className="muted">{products.length} ürün — düzenleme sonraki iterasyonda</p>
          {products.slice(0, 20).map((p) => (
            <div className="memberRow" key={p.id}>
              <span>{p.name}</span>
              <strong>{Number(p.price) || 0} ₺</strong>
            </div>
          ))}
        </div>
      )}

      {tab === 'campaign' && (
        <div className="card">
          <b>Push gönder</b>
          <label>Başlık</label>
          <input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} />
          <label>Metin</label>
          <input value={pushBody} onChange={(e) => setPushBody(e.target.value)} />
          <button type="button" className="btn btnPrimary" onClick={onSendPush}>Gönder</button>
        </div>
      )}

      {tab === 'health' && (
        <div className="card">
          <b>Sistem sağlığı</b>
          <p className="muted">Yalnızca sunucu /api/health — false-positive Guardian yok</p>
          <div className={`statusPill ${health?.ok ? 'on' : 'off'}`}>
            {health?.ok ? 'API yanıt veriyor' : 'API yanıt vermiyor / kontrol ediliyor'}
          </div>
          {health?.data?.dbOk != null && (
            <p className="muted">dbOk: {String(health.data.dbOk)}</p>
          )}
        </div>
      )}
    </div>
  );
}
