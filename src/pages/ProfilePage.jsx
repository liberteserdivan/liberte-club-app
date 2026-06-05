import { useState } from 'react';
import { Crown, LogOut, Mail, Phone, ShieldCheck, Trash2, User } from 'lucide-react';
import Header from '../components/Header.jsx';
import PageShell from '../components/PageShell.jsx';
import PageSection from '../components/PageSection.jsx';
import CafeContactBar from '../components/CafeContactBar.jsx';
import LegalSheet from '../components/LegalSheet.jsx';
import { PushWelcomeBanner } from '../components/Cards.jsx';
import { levelByStamps } from '../lib/db.js';
import { clearLocalCustomerSession, deleteCustomerAccount } from '../lib/customerAccount.js';
import { supportEmail } from '../lib/constants.js';

// Profil — çıkış, hesap silme, yasal linkler
export default function ProfilePage({
  db, customer, card, commit, setSession, setTab, sync, refreshRemote
}) {
  const [legalType, setLegalType] = useState('');
  const [message, setMessage] = useState('');
  const level = card.level || levelByStamps(card.lifetimeStamps || 0);

  function logout() {
    setSession(null);
  }

  function removeAccount() {
    const ok = confirm(
      'Hesabın ve tüm sadakat verilerin kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?'
    );
    if (!ok) return;

    try {
      const next = deleteCustomerAccount(db, customer.id);
      commit(next);
      clearLocalCustomerSession(customer.id);
      setSession(null);
    } catch (error) {
      setMessage(error.message || 'Hesap silinemedi.');
    }
  }

  const profileHero = (
    <div className="profileHeroCard">
      <div className="profileAvatar" aria-hidden="true"><User size={28} /></div>
      <div className="profileHeroInfo">
        <strong>{customer.name}</strong>
        <p><Phone size={14} aria-hidden="true" /> {customer.phone}</p>
        {customer.email && <p><Mail size={14} aria-hidden="true" /> {customer.email}</p>}
      </div>
      <div className="profileLevelBadge"><Crown size={14} aria-hidden="true" /> {level}</div>
    </div>
  );

  return (
    <PageShell
      variant="profile"
      header={(
        <Header
          db={db}
          customer={customer}
          sync={sync}
          refreshRemote={refreshRemote}
          showLogout={false}
        />
      )}
      eyebrow="Liberte Club"
      title="Profilim"
      subtitle="Hesap ayarları, destek ve yasal bilgiler"
      heroSlot={profileHero}
    >
      <PageSection label="İletişim">
        <CafeContactBar />
      </PageSection>

      <PageSection label="Bildirimler" tight>
        <PushWelcomeBanner db={db} customer={customer} commit={commit} />
      </PageSection>

      <PageSection label="Hesap">
        <div className="profileActionStack">
          <button type="button" className="profileAction" onClick={logout}>
            <LogOut size={18} /> Çıkış Yap
          </button>
          {customer.isAdmin && (
            <button type="button" className="profileAction" onClick={() => setTab('admin')}>
              <ShieldCheck size={18} /> Yönetim Paneli
            </button>
          )}
          <button type="button" className="profileAction danger" onClick={removeAccount}>
            <Trash2 size={18} /> Hesabımı Sil
          </button>
          {message && <p className="profileMessage">{message}</p>}
          <p className="profileHint">Destek: {supportEmail}</p>
        </div>
      </PageSection>

      <PageSection label="Yasal">
        <div className="profileActionStack">
          <button type="button" className="profileAction ghost" onClick={() => setLegalType('privacy')}>
            Gizlilik Politikası
          </button>
          <button type="button" className="profileAction ghost" onClick={() => setLegalType('terms')}>
            Kullanım Şartları
          </button>
        </div>
      </PageSection>

      {legalType && <LegalSheet type={legalType} onClose={() => setLegalType('')} />}
    </PageShell>
  );
}
