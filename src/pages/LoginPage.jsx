import React, { useState } from 'react';
import { KeyRound, LogIn, ShieldCheck, ShoppingBag, UserPlus, X } from 'lucide-react';
import Brand from '../components/Brand.jsx';
import LegalSheet from '../components/LegalSheet.jsx';
import CafeContactBar from '../components/CafeContactBar.jsx';
import MenuPage from './MenuPage.jsx';
import { apiJson } from '../lib/apiClient.js';
import {
  isValidDevPin,
  makeDevAuthCode,
  registerDevPin,
  saveDevAuthCode,
  useLocalAuth,
  verifyDevAuthCode,
  verifyDevPin
} from '../lib/devAuth.js';
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
  const [authMode, setAuthMode] = useState('login');
  const [registerStep, setRegisterStep] = useState('form');
  const [forgotStep, setForgotStep] = useState('email');
  const [phone, setPhone] = useState(() => localStorage.getItem('liberteLastPhone') || '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => localStorage.getItem('liberteLastEmail') || '');
  const [birthDate, setBirthDate] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetCode2, setResetCode2] = useState('');
  const [registerCode, setRegisterCode] = useState('');
  const [registerCode2, setRegisterCode2] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState('');
  const [legalType, setLegalType] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  const notify = (message, type = 'warning') => setNotice({ message, type });
  const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

  function readPins(requireConfirm = false) {
    const p = String(pin).replace(/\D/g, '');
    const c = String(pinConfirm).replace(/\D/g, '');
    if (!isValidDevPin(p)) {
      notify('PIN 4 veya 6 haneli olmalı.');
      return null;
    }
    if (requireConfirm && p !== c) {
      notify('PIN tekrarı eşleşmiyor.');
      return null;
    }
    return p;
  }

  function finishSession(result) {
    setPin('');
    setPinConfirm('');
    const session = applyAuthResult(result);
    localStorage.setItem('liberteLastPhone', phone || '');
    if (email) localStorage.setItem('liberteLastEmail', email);
    setSession(session);
  }

  async function createCustomerLocal(fields, pinValue) {
    const next = mergeDb(db);
    if (findByPhone(fields.ph) || findByEmail(fields.em)) {
      notify('Bu telefon veya e-posta ile zaten kayıt var.', 'info');
      return;
    }

    const referrer = findReferrerByCode(next, fields.referralCode);
    const customer = {
      id: Date.now(),
      phone: fields.ph,
      name: fields.nm,
      email: fields.em,
      isAdmin: false,
      createdAt: new Date().toLocaleString('tr-TR'),
      lastVisit: new Date().toISOString(),
      birthDate: fields.birthDate || '',
      referralCode: makeReferralCode(fields.nm, fields.ph, Date.now()),
      referredBy: referrer?.id || null
    };

    next.customers = [...next.customers, customer];
    next.loyalty = { ...next.loyalty, [customer.id]: loyaltyTemplate(customer.id) };
    let withBonus = addStampToCustomer(next, customer.id, 2, 'Yeni üye hoş geldin bonusu');

    if (referrer) {
      withBonus = addStampToCustomer(withBonus, customer.id, 2, 'Referans kayıt bonusu');
      withBonus = addStampToCustomer(withBonus, referrer.id, 2, `${customer.name} referans kaydı`);
    }

    commit(withBonus);
    await registerDevPin(fields.ph, pinValue);
    finishSession({ customerId: customer.id, role: 'user', isAdmin: false, adminVerified: false });
  }

  async function loginWithPin() {
    const ph = readPhone();
    const pinValue = readPins(false);
    if (!ph || !pinValue) return;

    setLoading(true);
    setInfo('');

    try {
      if (useLocalAuth()) {
        const customer = findByPhone(ph);
        if (!customer) {
          notify('Bu telefon ile kayıt bulunamadı. Önce kayıt ol.', 'info');
          return;
        }
        await verifyDevPin(ph, pinValue);
        finishSession({
          customerId: customer.id,
          role: customer.isAdmin ? 'admin' : 'user',
          isAdmin: Boolean(customer.isAdmin),
          adminVerified: false
        });
        return;
      }

      const { response, data } = await apiJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone: ph, pin: pinValue, deviceId: getDeviceId() })
      });

      if (!response.ok) throw new Error(data.error || 'Giriş yapılamadı');
      finishSession(data);
    } catch (e) {
      notify(e.message || 'Giriş yapılamadı');
    } finally {
      setLoading(false);
    }
  }

  function readRegisterFields() {
    const ph = readPhone();
    if (!ph) return null;

    const nm = name.trim();
    const em = email.trim().toLowerCase();
    if (!validEmail(em)) {
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

  async function sendRegisterCodes() {
    const fields = readRegisterFields();
    if (!fields) return;

    const pinValue = readPins(true);
    if (!pinValue) return;

    setLoading(true);
    setInfo('');

    try {
      if (useLocalAuth()) {
        const devCode = makeDevAuthCode();
        const devCode2 = makeDevAuthCode();
        saveDevAuthCode(fields.ph, fields.em, devCode, devCode2);
        setRegisterStep('verify');
        setInfo(`Geliştirme modu — Kod 1: ${devCode}, Kod 2: ${devCode2}`);
        return;
      }

      const { response, data } = await apiJson('/api/auth/register-complete', {
        method: 'POST',
        body: JSON.stringify({
          action: 'send-code',
          phone: fields.ph,
          name: fields.nm,
          email: fields.em
        })
      });

      if (!response.ok) throw new Error(data.error || 'Kod gönderilemedi');

      setRegisterStep('verify');
      if (data.testCode && data.testCode2) {
        setInfo(`Test kodları — Kod 1: ${data.testCode}, Kod 2: ${data.testCode2}`);
      } else {
        setInfo(`İki doğrulama kodu ${data.emailMasked || maskEmail(fields.em)} adresine gönderildi.`);
      }
    } catch (e) {
      notify(e.message || 'Kod gönderilemedi');
    } finally {
      setLoading(false);
    }
  }

  async function registerAccount() {
    const fields = readRegisterFields();
    if (!fields) return;

    const pinValue = readPins(true);
    if (!pinValue) return;

    const code = registerCode.replace(/\D/g, '');
    const code2 = registerCode2.replace(/\D/g, '');
    if (code.length !== 6 || code2.length !== 6) {
      notify('E-postadaki iki doğrulama kodunu da gir.');
      return;
    }

    setLoading(true);
    setInfo('');

    try {
      if (useLocalAuth()) {
        verifyDevAuthCode(fields.ph, fields.em, code, code2);
        await createCustomerLocal(fields, pinValue);
        return;
      }

      const { response, data } = await apiJson('/api/auth/register-complete', {
        method: 'POST',
        body: JSON.stringify({
          action: 'complete',
          phone: fields.ph,
          name: fields.nm,
          email: fields.em,
          birthDate: fields.birthDate,
          referralCode: fields.referralCode,
          pin: pinValue,
          pinConfirm: pinValue,
          code,
          code2,
          deviceId: getDeviceId()
        })
      });

      if (!response.ok) throw new Error(data.error || 'Kayıt tamamlanamadı');
      finishSession(data);
    } catch (e) {
      notify(e.message || 'Kayıt tamamlanamadı');
    } finally {
      setLoading(false);
    }
  }

  function readForgotEmail() {
    const em = email.trim().toLowerCase();
    if (!validEmail(em)) {
      notify('Kayıtlı e-posta adresini gir.');
      return null;
    }
    return em;
  }

  async function sendForgotCode() {
    const em = readForgotEmail();
    if (!em) return;

    const customer = findByEmail(em);
    if (!customer) {
      notify('Bu e-posta ile kayıt bulunamadı.', 'info');
      return;
    }

    setLoading(true);
    setInfo('');

    try {
      if (useLocalAuth()) {
        const devCode = makeDevAuthCode();
        const devCode2 = makeDevAuthCode();
        saveDevAuthCode(customer.phone, em, devCode, devCode2);
        setForgotStep('reset');
        setInfo(`Geliştirme modu — Kod 1: ${devCode}, Kod 2: ${devCode2}`);
        return;
      }

      const { response, data } = await apiJson('/api/auth/forgot-pin', {
        method: 'POST',
        body: JSON.stringify({ action: 'send-code', email: em })
      });

      if (!response.ok) throw new Error(data.error || 'Kod gönderilemedi');

      setForgotStep('reset');
      if (data.testCode && data.testCode2) {
        setInfo(`Test kodları — Kod 1: ${data.testCode}, Kod 2: ${data.testCode2}`);
      } else {
        setInfo(`İki doğrulama kodu ${data.emailMasked || maskEmail(em)} adresine gönderildi.`);
      }
    } catch (e) {
      notify(e.message || 'Kod gönderilemedi');
    } finally {
      setLoading(false);
    }
  }

  async function resetForgotPin() {
    const em = readForgotEmail();
    const pinValue = readPins(true);
    if (!em || !pinValue) return;

    const code = resetCode.replace(/\D/g, '');
    const code2 = resetCode2.replace(/\D/g, '');
    if (code.length !== 6 || code2.length !== 6) {
      notify('E-postadaki iki doğrulama kodunu da gir.');
      return;
    }

    setLoading(true);

    try {
      if (useLocalAuth()) {
        const customer = findByEmail(em);
        if (!customer) throw new Error('Hesap bulunamadı');
        verifyDevAuthCode(customer.phone, em, code, code2);
        await registerDevPin(customer.phone, pinValue);
        setInfo('Yeni PIN kaydedildi. Giriş yapabilirsin.');
        switchMode('login');
        return;
      }

      const { response, data } = await apiJson('/api/auth/forgot-pin', {
        method: 'POST',
        body: JSON.stringify({
          action: 'reset',
          email: em,
          code,
          code2,
          pin: pinValue,
          pinConfirm: pinValue
        })
      });

      if (!response.ok) throw new Error(data.error || 'PIN sıfırlanamadı');

      setInfo('Yeni PIN kaydedildi. Giriş yapabilirsin.');
      switchMode('login');
    } catch (e) {
      notify(e.message || 'PIN sıfırlanamadı');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(mode) {
    setAuthMode(mode);
    setRegisterStep('form');
    setForgotStep('email');
    setPin('');
    setPinConfirm('');
    setResetCode('');
    setResetCode2('');
    setRegisterCode('');
    setRegisterCode2('');
    setInfo('');
  }

  return (
    <section className="loginPage">
      <div className="orb one" />
      <div className="orb two" />

      <div className="loginPageStack">
        <div className="loginCard">
          <Brand db={db} login />

          <h1>
            {authMode === 'login' && 'Giriş Yap'}
            {authMode === 'register' && 'Kayıt Ol'}
            {authMode === 'forgot' && 'PIN Sıfırla'}
          </h1>
          <p>
            {authMode === 'login' && 'Telefon numaran ve kişisel PIN ile giriş yap.'}
            {authMode === 'register' && registerStep === 'form' && 'Bilgilerini gir; e-postana iki doğrulama kodu gönderilir.'}
            {authMode === 'register' && registerStep === 'verify' && 'E-postadaki iki kodu gir ve kaydı tamamla.'}
            {authMode === 'forgot' && 'E-postana gelen iki kod ile yeni PIN belirle.'}
          </p>

          {authMode !== 'forgot' && (
            <div className="authSwitch">
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Giriş Yap</button>
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Kayıt Ol</button>
            </div>
          )}

          {authMode === 'login' && (
            <>
              <label>Telefon</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon numaran" inputMode="tel" />

              <label>PIN</label>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="4 veya 6 haneli PIN"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
              />

              <button disabled={loading} onClick={loginWithPin}>
                <LogIn /> {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              </button>

              <button type="button" className="ghost loginForgotBtn" onClick={() => switchMode('forgot')}>
                PIN&apos;imi unuttum
              </button>
            </>
          )}

          {authMode === 'register' && registerStep === 'form' && (
            <>
              <label>Telefon</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon numaran" inputMode="tel" />

              <label>İsim Soyisim <em>*</em></label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad Soyad" />

              <label>E-posta <em>*</em></label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta adresin" inputMode="email" />
              <p className="loginHint mini">İki doğrulama kodu bu adrese gönderilir.</p>

              <label>Doğum Tarihi</label>
              <input value={birthDate} onChange={(e) => setBirthDate(e.target.value)} type="date" />

              <label>Referans Kodu</label>
              <input value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="Varsa davet kodun" />

              <label>PIN belirle <em>*</em></label>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="4 veya 6 hane"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
              />

              <label>PIN tekrar <em>*</em></label>
              <input
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="PIN tekrar"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
              />

              <p className="loginLegal">
                Kayıt olarak{' '}
                <button type="button" className="loginLegalLink" onClick={() => setLegalType('privacy')}>Gizlilik Politikası</button>
                {' '}ve{' '}
                <button type="button" className="loginLegalLink" onClick={() => setLegalType('terms')}>Kullanım Şartları</button>
                {' '}nı kabul etmiş olursun.
              </p>

              <button disabled={loading} onClick={sendRegisterCodes}>
                <ShieldCheck /> {loading ? 'Gönderiliyor...' : 'Doğrulama Kodlarını Gönder'}
              </button>
            </>
          )}

          {authMode === 'register' && registerStep === 'verify' && (
            <>
              <label>Doğrulama kodu 1</label>
              <input value={registerCode} maxLength={6} onChange={(e) => setRegisterCode(e.target.value)} placeholder="6 haneli kod" inputMode="numeric" />

              <label>Doğrulama kodu 2</label>
              <input value={registerCode2} maxLength={6} onChange={(e) => setRegisterCode2(e.target.value)} placeholder="6 haneli kod" inputMode="numeric" />

              <button disabled={loading} onClick={registerAccount}>
                <UserPlus /> {loading ? 'Kaydediliyor...' : 'Kaydı Tamamla'}
              </button>

              <button type="button" className="ghost" onClick={() => setRegisterStep('form')}>Kodları yeniden gönder</button>
            </>
          )}

          {authMode === 'forgot' && forgotStep === 'email' && (
            <>
              <label>E-posta</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Kayıtlı e-posta adresin"
                inputMode="email"
                autoComplete="email"
              />

              <button disabled={loading} onClick={sendForgotCode}>
                <ShieldCheck /> {loading ? 'Gönderiliyor...' : 'Doğrulama Kodlarını Gönder'}
              </button>

              <button type="button" className="ghost" onClick={() => switchMode('login')}>Girişe dön</button>
            </>
          )}

          {authMode === 'forgot' && forgotStep === 'reset' && (
            <>
              <label>Doğrulama kodu 1</label>
              <input value={resetCode} maxLength={6} onChange={(e) => setResetCode(e.target.value)} placeholder="6 haneli kod" inputMode="numeric" />

              <label>Doğrulama kodu 2</label>
              <input value={resetCode2} maxLength={6} onChange={(e) => setResetCode2(e.target.value)} placeholder="6 haneli kod" inputMode="numeric" />

              <label>Yeni PIN</label>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="4 veya 6 hane"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
              />

              <label>Yeni PIN tekrar</label>
              <input
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="PIN tekrar"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
              />

              <button disabled={loading} onClick={resetForgotPin}>
                <KeyRound /> {loading ? 'Kaydediliyor...' : 'Yeni PIN Kaydet'}
              </button>

              <button type="button" className="ghost" onClick={() => setForgotStep('email')}>Kodları yeniden gönder</button>
            </>
          )}

          {info && <p className="info">{info}</p>}
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

      {notice && (
        <div className="noticeBackdrop" onClick={() => setNotice(null)}>
          <div className={`noticeModal ${notice.type}`} onClick={(e) => e.stopPropagation()}>
            <div className="noticeIcon"><ShieldCheck /></div>
            <h3>{notice.type === 'info' ? 'Bilgilendirme' : 'Kontrol Edelim'}</h3>
            <p>{notice.message}</p>
            <button onClick={() => setNotice(null)}>Tamam</button>
          </div>
        </div>
      )}
    </section>
  );
}
