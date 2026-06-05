import React, { useState } from 'react';
import { LogIn, Mail, ShieldCheck } from 'lucide-react';
import Brand from '../components/Brand.jsx';
import LegalSheet from '../components/LegalSheet.jsx';
import CafeContactBar from '../components/CafeContactBar.jsx';
import { makeDevAuthCode, saveDevAuthCode, useLocalAuth, verifyDevAuthCode } from '../lib/devAuth.js';
import { clearAuthPending, loadAuthPending, saveAuthPending } from '../lib/authPending.js';
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

  const [authMode, setAuthMode] = useState(registerPending ? 'register' : 'login');
  const [phone, setPhone] = useState(() => localStorage.getItem('liberteLastPhone') || '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => localStorage.getItem('liberteLastEmail') || '');
  const [birthDate, setBirthDate] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(registerPending ? 'code' : 'form');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(registerPending ? 'Doğrulama kodunu gir.' : '');
  const [pending, setPending] = useState(registerPending);
  const [legalType, setLegalType] = useState('');
  const [notice, setNotice] = useState(null);

  // Kod adımı bilgilerini oturumda tut
  function storePending(data) {
    setPending(data);
    saveAuthPending(data);
  }

  const notify = (message, type = 'warning') => setNotice({ message, type });
  const valid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const findByPhone = (ph) => (db.customers || []).find((x) => x.phone === ph);
  const findByEmail = (em) => (db.customers || []).find((x) => String(x.email || '').toLowerCase() === em);

  // E-posta adresini güvenli şekilde maskele
  function maskEmail(value = '') {
    const em = String(value).trim().toLowerCase();
    const [local, domain] = em.split('@');
    if (!local || !domain) return em;
    if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
    return `${local[0]}***${local.slice(-1)}@${domain}`;
  }

  // Giriş — yalnızca telefon
  function readPhone() {
    const ph = norm(phone);
    if (ph.length < 10) {
      notify('Telefon numaranı 10 hane olarak gir.');
      return null;
    }
    return ph;
  }

  // Kayıt formu alanlarını doğrula
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

  function createCustomer(f) {
    const next = mergeDb(db);
    const duplicatePhone = (next.customers || []).some((x) => x.phone === f.ph);
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
      isAdmin: f.ph === '5058665406',
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

    withBonus.history = [
      {
        id: Date.now() + 3,
        customerId: c.id,
        name: c.name,
        phone: c.phone,
        type: 'register',
        count: 0,
        source: referrer ? `Referanslı kayıt: ${referrer.name}` : 'Kullanıcı kayıt',
        createdAt: new Date().toLocaleString('tr-TR')
      },
      ...(withBonus.history || [])
    ];

    commit(withBonus);
    setSession({ customerId: c.id });
  }

  function loginExisting(customer) {
    const createdAt = new Date().toLocaleString('tr-TR');
    commit({
      ...db,
      customers: (db.customers || []).map((c) => (
        c.id === customer.id ? { ...c, lastVisit: new Date().toISOString() } : c
      )),
      history: [
        {
          id: Date.now() + 44,
          customerId: customer.id,
          name: customer.name,
          phone: customer.phone,
          type: 'login',
          count: 0,
          source: 'Kullanıcı giriş',
          createdAt
        },
        ...(db.history || [])
      ]
    });
    localStorage.setItem('liberteLastPhone', customer.phone || '');
    localStorage.setItem('liberteLastEmail', customer.email || '');
    setSession({ customerId: customer.id });
  }

  // Kayıtlı üye — telefon ile doğrudan giriş
  function loginWithPhone() {
    const ph = readPhone();
    if (!ph) return;

    const customer = findByPhone(ph);
    if (!customer) {
      notify('Bu telefon ile kayıt bulunamadı. Önce Kayıt Ol ekranından üye ol.', 'info');
      return;
    }

    setLoading(true);
    try {
      loginExisting(customer);
    } finally {
      setLoading(false);
    }
  }

  // Kayıt — e-posta doğrulama kodu gönder
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

      const r = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: f.ph,
          name: f.nm,
          email: f.em,
          purpose: 'register'
        })
      });

      const text = await r.text();
      const j = text ? JSON.parse(text) : {};

      if (!r.ok) {
        throw new Error(j.error || 'Kod gönderilemedi');
      }

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
      } else {
        const r = await fetch('/api/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: f.ph,
            email: f.em,
            code: normalizedCode
          })
        });

        const text = await r.text();
        const j = text ? JSON.parse(text) : {};

        if (!r.ok) {
          throw new Error(j.error || 'Kod doğrulanamadı');
        }
      }

      createCustomer(f);
      clearAuthPending();
      setPending(null);
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

  const showRegisterCodeStep = authMode === 'register' && step === 'code';

  return <section className="loginPage">
    <div className="orb one"></div>
    <div className="orb two"></div>

    <div className="loginCard">
      <Brand db={db} login />

      <h1>{authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}</h1>
      <p>
        {authMode === 'login'
          ? 'Kayıtlı Liberte Club hesabına telefon numaranla giriş yap.'
          : 'QR sadakat kartı, özel kampanyalar ve Liberte ayrıcalıkları için kayıt ol.'}
      </p>

      <div className="authSwitch">
        <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Giriş Yap</button>
        <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Kayıt Ol</button>
      </div>

      {!showRegisterCodeStep ? <>
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

        <button disabled={loading} onClick={verifyRegisterCode}>
          <ShieldCheck/> {loading ? 'Kontrol ediliyor...' : 'Kaydı Tamamla'}
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
    </div>

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
