import { useState } from 'react';
import { LogOut, ShieldCheck, Trash2, User } from 'lucide-react';
import Header from '../components/Header.jsx';
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

  return (
    <section className="profilePage">
      <Header
        db={db}
        customer={customer}
        sync={sync}
        refreshRemote={refreshRemote}
        showLogout={false}
      />

      <div className="profileHero card">
        <div className="profileAvatar" aria-hidden="true"><User size={28} /></div>
        <div>
          <span>PROFİL</span>
          <h2>{customer.name}</h2>
          <p>{customer.phone}</p>
          {customer.email && <p>{customer.email}</p>}
          <em>Seviye: {level}</em>
        </div>
      </div>

      <CafeContactBar />

      <PushWelcomeBanner db={db} customer={customer} commit={commit} />

      <div className="profileSection card">
        <span>HESAP</span>
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

      <div className="profileSection card">
        <span>YASAL</span>
        <button type="button" className="profileAction ghost" onClick={() => setLegalType('privacy')}>
          Gizlilik Politikası
        </button>
        <button type="button" className="profileAction ghost" onClick={() => setLegalType('terms')}>
          Kullanım Şartları
        </button>
      </div>

      {legalType && <LegalSheet type={legalType} onClose={() => setLegalType('')} />}
    </section>
  );
}
