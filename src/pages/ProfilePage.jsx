import { useState } from 'react';
import { Crown, Mail, Phone, ShieldCheck, Trash2, User, ExternalLink } from 'lucide-react';
import PageShell from '../components/PageShell.jsx';
import PageSection from '../components/PageSection.jsx';
import CafeContactBar from '../components/CafeContactBar.jsx';
import LegalSheet from '../components/LegalSheet.jsx';
import MembershipTierCard from '../components/MembershipTierCard.jsx';
import { PushWelcomeBanner, PushDeviceStatusCard } from '../components/Cards.jsx';
import { getLpCardView } from '../lib/db.js';
import { TIER_TONE } from '../lib/membershipTier.js';
import { apiJson } from '../lib/apiClient.js';
import { isLocalAuth } from '../lib/devAuth.js';
import { clearLocalCustomerSession, deleteCustomerAccount } from '../lib/customerAccount.js';
import { clearQuickLoginPin } from '../lib/session.js';
import { formatPhoneInput } from '../lib/phoneMask.js';
import { supportEmail, supportUrl, CLUB_APP_NAME } from '../lib/constants.js';

// Telefon numarasını okunabilir formata çevir
function formatDisplayPhone(phone = '') {
  return formatPhoneInput(phone) || phone;
}

// Profil — hesap silme, yasal linkler (cikis kaldirildi; oturum cihazda korunur)
export default function ProfilePage({
  db, customer, card, commit, setSession, setTab, isAdmin = false, onOpenAdmin
}) {
  const [legalType, setLegalType] = useState('');
  const [message, setMessage] = useState('');
  const lp = getLpCardView(card);
  const level = lp.level;
  const tierTone = TIER_TONE[level] || 'bronze';

  async function removeAccount() {
    const ok = confirm(
      'Hesabın ve tüm sadakat verilerin kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?'
    );
    if (!ok) return;

    try {
      if (isLocalAuth()) {
        const next = deleteCustomerAccount(db, customer.id);
        commit(next);
        clearLocalCustomerSession(customer.id);
        clearQuickLoginPin();
        setSession(null);
        return;
      }

      const { response, data } = await apiJson('/api/account/delete', { method: 'POST' });
      if (!response.ok) throw new Error(data.error || 'Hesap silinemedi');

      clearLocalCustomerSession(customer.id);
      clearQuickLoginPin();
      setSession(null);
    } catch (error) {
      setMessage(error.message || 'Hesap silinemedi.');
    }
  }

  const profileHero = (
    <div className="profileHeroCard">
      <div className="profileAvatar" aria-hidden="true"><User size={28} /></div>
      <div className="profileHeroInfo">
        <strong>{customer?.name || 'Üye'}</strong>
        <p><Phone size={14} aria-hidden="true" /> {formatDisplayPhone(customer.phone)}</p>
        {customer.email && <p><Mail size={14} aria-hidden="true" /> {customer.email}</p>}
      </div>
      <div className={`profileLevelBadge profileLevelBadge--${tierTone}`}><Crown size={14} aria-hidden="true" /> {level}</div>
    </div>
  );

  return (
    <PageShell
      variant="profile"
      eyebrow={CLUB_APP_NAME}
      title="Profilim"
      subtitle="Hesap ayarları, destek ve yasal bilgiler"
      heroSlot={profileHero}
    >
      <PageSection>
        <MembershipTierCard card={card} customer={customer} history={db.history || []} />
      </PageSection>

      <PageSection label="İletişim">
        <CafeContactBar />
      </PageSection>

      <PageSection label="Bildirimler" tight>
        <PushWelcomeBanner db={db} customer={customer} commit={commit} />
        <PushDeviceStatusCard db={db} customer={customer} commit={commit} />
      </PageSection>

      <PageSection label="Hesap">
        <div className="profileActionStack">
          {isAdmin && (
            <button type="button" data-testid="open-admin-panel" className="profileAction" onClick={() => (onOpenAdmin ? onOpenAdmin() : setTab('admin'))}>
              <ShieldCheck size={18} /> Yönetim Paneli
            </button>
          )}
          <button type="button" className="profileAction danger" onClick={removeAccount}>
            <Trash2 size={18} /> Hesabımı Sil
          </button>
          {message && <p className="profileMessage">{message}</p>}
          <a className="profileAction ghost profileSupportLink" href={supportUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} /> Destek sayfası
          </a>
          <p className="profileHint">E-posta: {supportEmail}</p>
          <p className="profileHint">Sürüm: {import.meta.env.VITE_APP_VERSION || '1.1.2'}</p>
        </div>
      </PageSection>

      <PageSection label="Yasal" className="profileLegalSection">
        <div className="profileActionStack">
          <button type="button" className="profileAction ghost" onClick={() => setLegalType('privacy')}>
            Gizlilik Politikası
          </button>
          <button type="button" className="profileAction ghost" onClick={() => setLegalType('terms')}>
            Kullanım Şartları
          </button>
        </div>
      </PageSection>

      <div className="pageEndSpacer" aria-hidden="true" />

      {legalType && <LegalSheet type={legalType} onClose={() => setLegalType('')} />}
    </PageShell>
  );
}
