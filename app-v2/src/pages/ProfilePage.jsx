import { useState } from 'react';
import PageHero from '../components/PageHero.jsx';
import { privacyPolicyUrl, supportEmail, supportUrl, termsUrl } from '../lib/constants.js';
import { clearQuickLoginPin } from '../lib/sessionStore.js';
import { apiJson } from '../lib/apiClient.js';
import { enableNativePush, hasActivePush, getLocalPushToken } from '../services/pushService.js';
import { isNativeApp } from '../lib/platform.js';

export default function ProfilePage({
  customer, state, session, onOpenAdmin, onLogout, showToast, refresh
}) {
  const [busy, setBusy] = useState(false);
  const active = hasActivePush(customer?.id, state?.pushSubscriptions || [])
    || Boolean(getLocalPushToken(customer?.id));

  async function enablePush() {
    if (!customer?.id) return;
    setBusy(true);
    try {
      if (!isNativeApp()) {
        showToast('Bildirimler native uygulamada açılır', 'error');
        return;
      }
      await enableNativePush(customer.id);
      showToast('Bildirimler açıldı');
      await refresh?.();
    } catch (err) {
      showToast(err.message || 'Bildirim açılamadı', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!confirm('Hesabın kalıcı silinecek. Devam?')) return;
    try {
      const { response, data } = await apiJson('/api/account/delete', { method: 'POST' });
      if (!response.ok) throw new Error(data?.error || 'Silinemedi');
      clearQuickLoginPin();
      onLogout();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div data-testid="profile-page">
      <PageHero title="Profilim" subtitle={customer?.phone || ''} />
      <div className="card">
        <b>{customer?.name || 'Üye'}</b>
        <p className="muted">{customer?.email || 'E-posta yok'}</p>
      </div>

      <div className="card">
        <b>Bildirimler</b>
        <div className={`statusPill ${active ? 'on' : 'off'}`} data-testid={active ? 'push-device-status-on' : 'push-device-status-off'}>
          {active ? 'Bu cihazda açık' : 'Bu cihazda kapalı'}
        </div>
        {!active && (
          <button type="button" className="btn btnPrimary" style={{ marginTop: 10 }} disabled={busy} onClick={enablePush}>
            {busy ? 'Açılıyor…' : 'Bildirimleri Aç'}
          </button>
        )}
      </div>

      {session?.isAdmin && (
        <button type="button" className="btn btnPrimary" data-testid="open-admin-panel" onClick={onOpenAdmin}>
          Yönetim Paneli
        </button>
      )}

      <div className="card">
        <b>Destek & yasal</b>
        <div className="rowActions">
          <a className="btn ghost" href={supportUrl} target="_blank" rel="noreferrer">Destek</a>
          <a className="btn ghost" href={`mailto:${supportEmail}`}>E-posta</a>
          <a className="btn ghost" href={privacyPolicyUrl} target="_blank" rel="noreferrer">Gizlilik</a>
          <a className="btn ghost" href={termsUrl} target="_blank" rel="noreferrer">Koşullar</a>
        </div>
      </div>

      <button type="button" className="btn ghost" onClick={deleteAccount}>Hesabı Sil</button>
    </div>
  );
}
