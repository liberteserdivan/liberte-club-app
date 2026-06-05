import React, { useState } from 'react';
import { LogIn, Mail, ShieldCheck, ShoppingBag, X } from 'lucide-react';
import Brand from '../components/Brand.jsx';
import LegalSheet from '../components/LegalSheet.jsx';
import CafeContactBar from '../components/CafeContactBar.jsx';
import MenuPage from './MenuPage.jsx';
import { apiJson } from '../lib/apiClient.js';
import { makeDevAuthCode, saveDevAuthCode, useLocalAuth, verifyDevAuthCode } from '../lib/devAuth.js';
import { clearAuthPending, loadAuthPending, saveAuthPending } from '../lib/authPending.js';
import { getDeviceId } from '../lib/deviceId.js';
import { applyAuthResult } from '../lib/session.js';
import {
  addStampToCustomer,
  findReferrerByCode,
  getReferralCode,
  loyaltyTemplate,
  makeReferralCode,
  mergeDb,
  norm
} from '../lib/db.js';

export default function Login({ db, commit, setSession }) {
  const restoredPending = loadAuthPending();
  const registerPending = restoredPending?.mode === 'register' ? restoredPending : null;
  const loginPending = restoredPending?.mode === 'login' ? restoredPending : null;

  const [authMode, setAuthMode] = useState(
    registerPending ? 'register' : loginPending ? 'login' : 'login'
  );
  const [phone, setPhone] = useState(() => localStorage.getItem('liberteLastPhone') || '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => localStorage.getItem('liberteLastEmail') || '');
  const [birthDate, setBirthDate] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(registerPending || loginPending ? 'code' : 'form');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(
    registerPending || loginPending ? 'Doğrulama kodunu gir.' : ''
  );
  const [pending, setPending] = useState(registerPending || loginPending);
  const [legalType, setLegalType] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  function storePending(data) {
    setPending(data);
    saveAuthPending(data);
  }

  const notify = (message, type = 'warning') => setNotice({ message, type });
  const valid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const findByPhone = (ph) => (db.customers || []).find((x) => norm(x.phone) === norm(ph));
  const findByEmail = (em) => (db.customers || []).find((x) => String(x.email || '').toLowerCase() === em);

  function maskEmail(value = '') {
    const em = String(value).trim().toLowerCase();
    const [local, domain] = em.split('@');
    if (!local || !domain) return em;
    if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
    return `${local[0]}***${local.slice(-1)}@${domain}`;
  }

  function readPhone() {
    const ph = norm(phone);
    if (ph.length < 10) {
      notify('Telefon numaranı 10 hane olarak gir.');
      return null;
    }
    return ph;
  }

  function registerFields() {
    const ph = readPhone();
    if (!ph) return null;

    const nm = name.trim();
    const em = email.trim().toLowerCase();

    if (!valid(em)) {
      notify('Geçerli bir e-posta adresi gir.');
      return null;
    }

    if (nm.split(' ').filter(Boolean).length < 2) {
      notify('Kayıt için isim soyisim zorunlu.');
      return null;
    }

    return {
      ph,
      nm,
      em,
      birthDate,
      referralCode: referralCode.trim().toUpperCase().replace(/\s/g, '')
    };
  }

  function finishSession(result) {
    const session = applyAuthResult(result);
    localStorage.setItem('liberteLastPhone', phone || '');
    if (email) localStorage.setItem('liberteLastEmail', email);
    setSession(session);
  }

  function createCustomerLocal(f) {
    const next = mergeDb(db);
    const duplicatePhone = (next.customers || []).some((x) => norm(x.phone) === f.ph);
    const duplicateEmail = (next.customers || []).some((x) => String(x.email || '').toLowerCase() === f.em);
    if (duplicatePhone || duplicateEmail) {
      notify('Bu telefon veya e-posta ile zaten kayıt var. Lütfen Giriş Yap ekranını kullan.', 'info');
      return;
    }

    const referrer = findReferrerByCode(next, f.referralCode);
    const c = {
      id: Date.now(),
      phone: f.ph,
      name: f.nm,
      email: f.em,
      isAdmin: false,
      createdAt: new Date().toLocaleString('tr-TR'),
      lastVisit: new Date().toISOString(),
      birthDate: f.birthDate || '',
      referralCode: makeReferralCode(f.nm, f.ph, Date.now()),
      referredBy: referrer?.id || null
    };

    if (f.referralCode && referrer?.phone === f.ph) {
      notify('Kendi referans kodunla kayıt oluşturamazsın.', 'info');
      return;
    }

    next.customers = [...next.customers, c];
    next.loyalty = { ...next.loyalty, [c.id]: loyaltyTemplate(c.id) };
    let withBonus = addStampToCustomer(next, c.id, 2, 'Yeni üye hoş geldin bonusu');

    if (referrer) {
      withBonus = addStampToCustomer(withBonus, c.id, 2, 'Referans kayıt bonusu');
      withBonus = addStampToCustomer(withBonus, referrer.id, 2, `${c.name} referans kaydı`);
      withBonus.referrals = [
        {
          id: Date.now() + 15,
          referrerId: referrer.id,
          referrerName: referrer.name,
          newCustomerId: c.id,
          newCustomerName: c.name,
          code: getReferralCode(referrer),
          bonus: 2,
          createdAt: new Date().toLocaleString('tr-TR')
        },
        ...(withBonus.referrals || [])
      ];
    }

    commit(withBonus);
    finishSession({ customerId: c.id, role: 'user', isAdmin: false, adminVerified: false });
  }

  function loginExistingLocal(customer) {
    commit({
      ...db,
      customers: (db.customers || []).map((c) => (
        c.id === customer.id ? { ...c, lastVisit: new Date().toISOString() } : c
      ))
    });
    finishSession({
      customerId: customer.id,
      role: customer.isAdmin ? 'admin' : 'user',
      isAdmin: Boolean(customer.isAdmin),
      adminVerified: false
    });
  }

  async function loginWithPhone() {
    const ph = readPhone();
    if (!ph) return;

    if (useLocalAuth()) {
      const customer = findByPhone(ph);
      if (!customer) {
        notify('Bu telefon ile kayıt bulunamadı. Önce Kayıt Ol ekranından üye ol.', 'info');
        return;
      }
      setLoading(true);
      try {
        loginExistingLocal(customer);
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setInfo('');

    try {
      const { response, data } = await apiJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone: ph, deviceId: getDeviceId() })
      });

      if (!response.ok) throw new Error(data.error || 'Giriş başarısız');

      if (!data.needsOtp) {
        finishSession(data);
        return;
      }

      const customer = findByPhone(ph);
      storePending({
        mode: 'login',
        ph,
        em: customer?.email || '',
        name: customer?.name || ''
      });
      setStep('code');
      setInfo(`Kod ${data.emailMasked || maskEmail(customer?.email)} adresine gönderildi.`);
      if (data.testCode) {
        setInfo(`Test kodu: ${data.testCode}${data.warning ? ` — ${data.warning}` : ''}`);
      }
    } catch (e) {
      notify(e.message || 'Giriş başarısız');
    } finally {
      setLoading(false);
    }
  }

  async function verifyLoginCode() {
    if (!pending || pending.mode !== 'login') {
      notify('Oturum süresi doldu. Lütfen yeniden giriş yap.');
      setStep('form');
      return;
    }

    const normalizedCode = code.replace(/\D/g, '');
    if (normalizedCode.length !== 6) {
      notify('6 haneli doğrulama kodunu gir.');
      return;
    }

    setLoading(true);

    try {
      const { response, data } = await apiJson('/api/auth/login-verify', {
        method: 'POST',
        body: JSON.stringify({
          phone: pending.ph,
          email: pending.em,
          code: normalizedCode,
          deviceId: getDeviceId()
        })
      });

      if (!response.ok) throw new Error(data.error || 'Kod doğrulanamadı');

      clearAuthPending();
      setPending(null);
      finishSession(data);
    } catch (e) {
      notify(e.message || 'Kod doğrulanamadı');
    } finally {
      setLoading(false);
    }
  }

  async function sendRegisterCode() {
    const f = registerFields();
    if (!f) return;

    if (findByPhone(f.ph) || findByEmail(f.em)) {
      notify('Bu telefon veya e-posta ile kayıt var. Lütfen Giriş Yap ekranını kullan.', 'info');
      return;
    }

    setLoading(true);
    setInfo('');

    try {
      if (useLocalAuth()) {
        const devCode = makeDevAuthCode();
        saveDevAuthCode(f.ph, f.em, devCode);
        storePending({ ...f, mode: 'register', customerId: null, name: f.nm });
        setStep('code');
        setInfo(`Geliştirme modu — doğrulama kodu: ${devCode}`);
        return;
      }

      const { response, data: j } = await apiJson('/api/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({
          phone: f.ph,
          name: f.nm,
          email: f.em,
          purpose: 'register'
        })
      });

      if (!response.ok) throw new Error(j.error || 'Kod gönderilemedi');

      storePending({
        ...f,
        mode: 'register',
        customerId: null,
        name: f.nm,
        ph: j.phone || f.ph,
        em: j.email || f.em
      });
      setStep('code');
      if (j.testCode) {
        setInfo(`Test kodu: ${j.testCode}${j.warning ? ` — ${j.warning}` : ''}`);
      } else {
        setInfo(`Kod ${maskEmail(f.em)} adresine gönderildi.`);
      }
    } catch (e) {
      notify(e.message || 'Kod gönderilemedi');
    } finally {
      setLoading(false);
    }
  }

  async function verifyRegisterCode() {
    if (!pending || pending.mode !== 'register') {
      notify('Oturum süresi doldu. Lütfen yeniden kod iste.');
      setStep('form');
      return;
    }

    const f = pending;
    const normalizedCode = code.replace(/\D/g, '');
    if (normalizedCode.length !== 6) {
      notify('6 haneli doğrulama kodunu gir.');
      return;
    }

    setLoading(true);

    try {
      if (useLocalAuth()) {
        verifyDevAuthCode(f.ph, f.em, normalizedCode);
        createCustomerLocal(f);
        clearAuthPending();
        setPending(null);
        return;
      }

      const { response, data } = await apiJson('/api/auth/register-complete', {
        method: 'POST',
        body: JSON.stringify({
          phone: f.ph,
          email: f.em,
          name: f.nm,
          birthDate: f.birthDate,
          referralCode: f.referralCode,
          code: normalizedCode,
          deviceId: getDeviceId()
        })
      });

      if (!response.ok) throw new Error(data.error || 'Kayıt tamamlanamadı');

      clearAuthPending();
      setPending(null);
      finishSession(data);
    } catch (e) {
      notify(e.message || 'Kod doğrulanamadı');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(mode) {
    setAuthMode(mode);
    setStep('form');
    setCode('');
    setInfo('');
    setPending(null);
    clearAuthPending();
  }

  const showCodeStep = step === 'code';

  return <section className="loginPage">
    <div className="orb one"></div>
    <div className="orb two"></div>

    <div className="loginPageStack">
    <div className="loginCard">
      <Brand db={db} login />

      <h1>{authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}</h1>
      <p>
        {authMode === 'login'
          ? 'Kayıtlı hesabına telefon numaranla giriş yap. Yeni cihazda e-posta kodu istenir.'
          : 'QR sadakat kartı, özel kampanyalar ve Liberte ayrıcalıkları için kayıt ol.'}
      </p>

      <div className="authSwitch">
        <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Giriş Yap</button>
        <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Kayıt Ol</button>
      </div>

      {!showCodeStep ? <>
        <label>Telefon</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon numaran" inputMode="tel"/>

        {authMode === 'register' && <>
          <label>İsim Soyisim <em>*</em></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad Soyad"/>
          <label>Doğum Tarihi</label>
          <input value={birthDate} onChange={(e) => setBirthDate(e.target.value)} type="date"/>
          <p className="loginHint mini">Doğum gününde 1 içecek ikramı hesabına tanımlanır.</p>

          <label>Referans Kodu</label>
          <input value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="Varsa davet kodun"/>
          <p className="loginHint mini">Referans koduyla kayıt olursan sen de davet eden de +2 damga kazanır.</p>

          <label>E-posta <em>*</em></label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta adresin" inputMode="email"/>
          <p className="loginHint mini">Kayıt için e-postana doğrulama kodu gönderilir.</p>
        </>}

        {authMode === 'login' ? (
          <button disabled={loading} onClick={loginWithPhone}>
            <LogIn/> {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        ) : (
          <>
            <p className="loginLegal">
              Kayıt olarak{' '}
              <button type="button" className="loginLegalLink" onClick={() => setLegalType('privacy')}>
                Gizlilik Politikası
              </button>
              {' '}ve{' '}
              <button type="button" className="loginLegalLink" onClick={() => setLegalType('terms')}>
                Kullanım Şartları
              </button>
              {' '}nı kabul etmiş olursun.
            </p>
            <button disabled={loading} onClick={sendRegisterCode}>
              <Mail/> {loading ? 'Gönderiliyor...' : 'Mail Kod Gönder'}
            </button>
          </>
        )}

        {authMode === 'login' && <p className="loginHint">Henüz hesabın yoksa Kayıt Ol sekmesine geç.</p>}
        {authMode === 'register' && <p className="loginHint">Zaten hesabın varsa Giriş Yap sekmesini kullan.</p>}
        {info && <p className="info">{info}</p>}
      </> : <>
        <label>Mail kodu</label>
        <input value={code} maxLength={6} onChange={(e) => setCode(e.target.value)} placeholder="6 haneli kod"/>

        <button
          disabled={loading}
          onClick={authMode === 'login' ? verifyLoginCode : verifyRegisterCode}
        >
          <ShieldCheck/> {loading ? 'Kontrol ediliyor...' : authMode === 'login' ? 'Girişi Tamamla' : 'Kaydı Tamamla'}
        </button>

        <button className="ghost" onClick={() => setStep('form')}>
          Bilgileri değiştir
        </button>

        {info && <p className="info">{info}</p>}
      </>}
    </div>

    <div className="loginFooter">
      <p className="loginFooterLabel">Liberte Gastro Cafe</p>
      <CafeContactBar compact />
      <button type="button" className="loginMenuBtn" onClick={() => setMenuOpen(true)}>
        <ShoppingBag size={20} aria-hidden="true" />
        Menüyü Gör
      </button>
    </div>
    </div>

    {menuOpen && (
      <div className="loginMenuOverlay">
        <div className="loginMenuOverlayHead">
          <button type="button" className="loginMenuClose" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat">
            <X size={22} />
          </button>
          <span>Menü</span>
        </div>
        <div className="loginMenuOverlayBody">
          <MenuPage db={db} embedded />
        </div>
      </div>
    )}

    {legalType && <LegalSheet type={legalType} onClose={() => setLegalType('')} />}

    {notice && <div className="noticeBackdrop" onClick={() => setNotice(null)}>
      <div className={`noticeModal ${notice.type}`} onClick={(e) => e.stopPropagation()}>
        <div className="noticeIcon"><ShieldCheck/></div>
        <h3>{notice.type === 'info' ? 'Bilgilendirme' : 'Kontrol Edelim'}</h3>
        <p>{notice.message}</p>
        <button onClick={() => setNotice(null)}>Tamam</button>
      </div>
    </div>}
  </section>;
}
