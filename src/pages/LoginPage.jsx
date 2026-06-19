import React, { useState } from 'react';
import { KeyRound, LogIn, ShieldCheck, ShoppingBag, UserPlus, X } from 'lucide-react';
import Brand from '../components/Brand.jsx';
import LegalSheet from '../components/LegalSheet.jsx';
import CafeContactBar from '../components/CafeContactBar.jsx';
import MenuPage from './MenuPage.jsx';
import { apiJson, AUTH_REQUEST_OPTIONS, REGISTER_REQUEST_OPTIONS } from '../lib/apiClient.js';
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
  STORE_APP_NAME,
  BRAND_SLOGAN,
  LOYALTY_PROMO
} from '../lib/constants.js';
import { formatPhoneInput, formatPinInput } from '../lib/phoneMask.js';
import {
  findReferrerByCode,
  getReferralCode,
  loyaltyTemplate,
  generateUniqueReferralCode,
  mergeDb,
  mergeAuthSnapshot,
  norm,
  addStampToCustomer
} from '../lib/db.js';

export default function Login({ db, commit, setSession }) {
  const [authMode, setAuthMode] = useState('login');
  const [registerStep, setRegisterStep] = useState('form');
  const [forgotStep, setForgotStep] = useState('identify');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [phone, setPhone] = useState(() => formatPhoneInput(localStorage.getItem('liberteLastPhone') || ''));
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => localStorage.getItem('liberteLastEmail') || '');
  const [referralCode, setReferralCode] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [registerCode, setRegisterCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState('');
  const [legalType, setLegalType] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  const notify = (message, type = 'warning') => setNotice({ message, type });

  // API hata mesajını kullanıcı dostu metne çevir
  function readApiError(data, fallback) {
    const code = String(data?.code || '').trim();
    if (code === 'CUSTOMER_NOT_FOUND') {
      return 'Bu telefon ile kayıt bulunamadı. Önce kayıt olun.';
    }
    if (code === 'DUPLICATE_PHONE') {
      return 'Bu telefon zaten kayıtlı. Giriş yap veya PIN sıfırla.';
    }
    if (code === 'DUPLICATE_EMAIL') {
      return 'Bu e-posta zaten kayıtlı. Giriş yap veya PIN sıfırla.';
    }
    if (code === 'CUSTOMER_REPAIR_FAILED') {
      return `Hesap kaydı eksik görünüyor. PIN sıfırlamayı deneyin. Ref: ${data?.requestId || '—'}`;
    }
    if (code === 'NOT_ADMIN') {
      return 'Bu hesap admin yetkisine sahip değil.';
    }
    if (code === 'PIN_INVALID') {
      return 'PIN hatalı.';
    }
    if (code === 'PIN_NOT_FOUND') {
      return 'Bu hesap için PIN bulunamadı. PIN sıfırlayın.';
    }
    if (code === 'SESSION_CREATE_FAILED') {
      return `Oturum oluşturulamadı. Ref: ${data?.requestId || '—'}`;
    }
    const base = data?.clientMessage || data?.message || data?.error || fallback;
    if (data?.requestId) {
      return `${base} (Ref: ${data.requestId})`;
    }
    return base;
  }
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
      notify('Telefon numaranızı 10 hane olarak giriniz.');
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
    if (result.customer) {
      commit(mergeAuthSnapshot(db, {
        customer: result.customer,
        loyalty: result.loyalty
      }), { skipRemote: true });
    }
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
      birthDate: '',
      referralCode: generateUniqueReferralCode(next.customers),
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
        ...AUTH_REQUEST_OPTIONS,
        method: 'POST',
        body: JSON.stringify({ phone: ph, pin: pinValue, deviceId: getDeviceId() })
      });

      if (!response.ok || data?.ok === false) {
        throw new Error(readApiError(data, 'Giriş yapılamadı'));
      }
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
      notify('Ad soyad giriniz.');
      return null;
    }

    return {
      ph,
      nm,
      em,
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
        saveDevAuthCode(fields.ph, fields.em, devCode);
        setRegisterStep('verify');
        setInfo(`Geliştirme modu — doğrulama kodu: ${devCode}`);
        return;
      }

      const { response, data } = await apiJson('/api/auth/register-complete', {
        ...REGISTER_REQUEST_OPTIONS,
        method: 'POST',
        body: JSON.stringify({
          action: 'send-code',
          phone: fields.ph,
          name: fields.nm,
          email: fields.em
        })
      });

      if (!response.ok) {
        if (response.status === 409) {
          notify(readApiError(data, 'Bu telefon veya e-posta zaten kayıtlı. Giriş yap veya PIN sıfırla.'), 'info');
          return;
        }
        throw new Error(readApiError(data, 'Kod gönderilemedi'));
      }

      setRegisterStep('verify');
      if (data.testCode) {
        setInfo(`Test kodu: ${data.testCode}`);
      } else {
        setInfo(`Doğrulama kodu ${data.emailMasked || maskEmail(fields.em)} adresine gönderildi.`);
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
    if (code.length !== 6) {
      notify('6 haneli doğrulama kodunu gir.');
      return;
    }

    setLoading(true);
    setInfo('');

    try {
      if (useLocalAuth()) {
        verifyDevAuthCode(fields.ph, fields.em, code);
        await createCustomerLocal(fields, pinValue);
        return;
      }

      const { response, data } = await apiJson('/api/auth/register-complete', {
        ...REGISTER_REQUEST_OPTIONS,
        method: 'POST',
        body: JSON.stringify({
          action: 'complete',
          phone: fields.ph,
          name: fields.nm,
          email: fields.em,
          referralCode: fields.referralCode,
          pin: pinValue,
          pinConfirm: pinValue,
          code,
          deviceId: getDeviceId()
        })
      });

      if (!response.ok) {
        if (response.status === 409) {
          notify(readApiError(data, 'Bu telefon veya e-posta zaten kayıtlı. Giriş yap veya PIN sıfırla.'), 'info');
          return;
        }
        throw new Error(readApiError(data, 'Kayıt tamamlanamadı'));
      }
      finishSession(data);
    } catch (e) {
      notify(e.message || 'Kayıt tamamlanamadı');
    } finally {
      setLoading(false);
    }
  }

  function readForgotIdentifier() {
    const raw = forgotIdentifier.trim();
    if (!raw) {
      notify('Kayıtlı e-posta veya telefonunu gir.');
      return null;
    }
    if (raw.includes('@')) {
      const em = raw.toLowerCase();
      if (!validEmail(em)) {
        notify('Geçerli e-posta gir.');
        return null;
      }
      return em;
    }
    const ph = norm(raw);
    if (ph.length < 10) {
      notify('Geçerli e-posta veya 10 haneli telefon gir.');
      return null;
    }
    return ph;
  }

  function findCustomerByIdentifier(value) {
    if (String(value).includes('@')) {
      return findByEmail(String(value).toLowerCase());
    }
    return findByPhone(norm(value));
  }

  async function sendForgotCode() {
    const identifier = readForgotIdentifier();
    if (!identifier) return;

    setLoading(true);
    setInfo('');

    try {
      if (useLocalAuth()) {
        const customer = findCustomerByIdentifier(identifier);
        if (!customer?.email) {
          notify('Bu bilgi ile kayıt bulunamadı veya hesapta e-posta yok.', 'info');
          return;
        }

        const deliveryEmail = String(customer.email).toLowerCase();
        const devCode = makeDevAuthCode();
        saveDevAuthCode(customer.phone, deliveryEmail, devCode);
        setForgotStep('reset');
        setInfo(`Geliştirme modu — doğrulama kodu: ${devCode}`);
        return;
      }

      const { response, data } = await apiJson('/api/auth/forgot-pin', {
        ...AUTH_REQUEST_OPTIONS,
        method: 'POST',
        body: JSON.stringify({ action: 'send-code', identifier })
      });

      if (!response.ok) throw new Error(data.error || 'Kod gönderilemedi');

      setForgotStep('reset');
      if (data.testCode) {
        setInfo(`Test kodu: ${data.testCode}`);
      } else {
        setInfo(`Doğrulama kodu ${data.emailMasked || 'kayıtlı e-posta'} adresine gönderildi.`);
      }
    } catch (e) {
      notify(e.message || 'Kod gönderilemedi');
    } finally {
      setLoading(false);
    }
  }

  async function resetForgotPin() {
    const identifier = readForgotIdentifier();
    const pinValue = readPins(true);
    if (!identifier || !pinValue) return;

    const code = resetCode.replace(/\D/g, '');
    if (code.length !== 6) {
      notify('6 haneli doğrulama kodunu gir.');
      return;
    }

    setLoading(true);

    try {
      if (useLocalAuth()) {
        const customer = findCustomerByIdentifier(identifier);
        if (!customer?.email) throw new Error('Hesap bulunamadı');
        const deliveryEmail = String(customer.email).toLowerCase();
        verifyDevAuthCode(customer.phone, deliveryEmail, code);
        await registerDevPin(customer.phone, pinValue);
        setInfo('Yeni PIN kaydedildi. Giriş yapabilirsin.');
        switchMode('login');
        return;
      }

      const { response, data } = await apiJson('/api/auth/forgot-pin', {
        ...AUTH_REQUEST_OPTIONS,
        method: 'POST',
        body: JSON.stringify({
          action: 'reset',
          identifier,
          code,
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
    setForgotStep('identify');
    setForgotIdentifier('');
    setPin('');
    setPinConfirm('');
    setResetCode('');
    setRegisterCode('');
    setInfo('');
  }

  function onPhoneChange(value) {
    setPhone(formatPhoneInput(value));
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
            {authMode === 'login' && 'Telefon numaranız ve kişisel PIN ile giriş yapın.'}
            {authMode === 'register' && registerStep === 'form' && 'Bilgilerinizi girin; e-postanıza doğrulama kodu gönderilir.'}
            {authMode === 'register' && registerStep === 'verify' && 'E-postanızdaki kodu girin ve kaydı tamamlayın.'}
            {authMode === 'forgot' && 'E-posta veya telefonunuzu girin; kod kayıtlı e-postanıza gider.'}
          </p>

          {authMode !== 'forgot' && (
            <div className="authSwitch">
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Giriş Yap</button>
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Kayıt Ol</button>
            </div>
          )}

          {authMode === 'login' && (
            <>
              <label>Telefon numaranız</label>
              <input value={phone} onChange={(e) => onPhoneChange(e.target.value)} placeholder="0532 123 45 67" inputMode="tel" autoComplete="tel" />

              <label>PIN</label>
              <input
                value={pin}
                onChange={(e) => setPin(formatPinInput(e.target.value))}
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
              <label>Telefon numaranız</label>
              <input value={phone} onChange={(e) => onPhoneChange(e.target.value)} placeholder="0532 123 45 67" inputMode="tel" autoComplete="tel" />

              <label>Ad Soyad <em>*</em></label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad soyad giriniz" autoComplete="name" />

              <label>E-posta <em>*</em></label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta adresiniz" inputMode="email" autoComplete="email" />
              <p className="loginHint loginHint--verify">Doğrulama kodu bu adrese gönderilir.</p>

              <label>Referans Kodu</label>
              <input value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="Varsa davet kodunuzu giriniz" />

              <label>PIN belirleyin <em>*</em></label>
              <input
                value={pin}
                onChange={(e) => setPin(formatPinInput(e.target.value))}
                placeholder="4 veya 6 hane"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
              />

              <label>PIN tekrar <em>*</em></label>
              <input
                value={pinConfirm}
                onChange={(e) => setPinConfirm(formatPinInput(e.target.value))}
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
                <ShieldCheck /> {loading ? 'Gönderiliyor...' : 'Doğrulama Kodu Gönder'}
              </button>
            </>
          )}

          {authMode === 'register' && registerStep === 'verify' && (
            <>
              <label>Doğrulama kodu</label>
              <input value={registerCode} maxLength={6} onChange={(e) => setRegisterCode(formatPinInput(e.target.value, 6))} placeholder="6 haneli kod" inputMode="numeric" />

              <button disabled={loading} onClick={registerAccount}>
                <UserPlus /> {loading ? 'Kaydediliyor...' : 'Kaydı Tamamla'}
              </button>

              <button type="button" className="ghost" onClick={() => setRegisterStep('form')}>Kodları yeniden gönder</button>
            </>
          )}

          {authMode === 'forgot' && forgotStep === 'identify' && (
            <>
              <label>E-posta veya telefon</label>
              <input
                value={forgotIdentifier}
                onChange={(e) => setForgotIdentifier(e.target.value.includes('@') ? e.target.value : formatPhoneInput(e.target.value))}
                placeholder="E-posta veya telefon numaranız"
                inputMode="text"
                autoComplete="username"
              />

              <button disabled={loading} onClick={sendForgotCode}>
                <ShieldCheck /> {loading ? 'Gönderiliyor...' : 'Doğrulama Kodu Gönder'}
              </button>

              <button type="button" className="ghost" onClick={() => switchMode('login')}>Girişe dön</button>
            </>
          )}

          {authMode === 'forgot' && forgotStep === 'reset' && (
            <>
              <label>Doğrulama kodu</label>
              <input value={resetCode} maxLength={6} onChange={(e) => setResetCode(formatPinInput(e.target.value, 6))} placeholder="6 haneli kod" inputMode="numeric" />

              <label>Yeni PIN</label>
              <input
                value={pin}
                onChange={(e) => setPin(formatPinInput(e.target.value))}
                placeholder="4 veya 6 hane"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
              />

              <label>Yeni PIN tekrar</label>
              <input
                value={pinConfirm}
                onChange={(e) => setPinConfirm(formatPinInput(e.target.value))}
                placeholder="PIN tekrar"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
              />

              <button disabled={loading} onClick={resetForgotPin}>
                <KeyRound /> {loading ? 'Kaydediliyor...' : 'Yeni PIN Kaydet'}
              </button>

              <button type="button" className="ghost" onClick={() => setForgotStep('identify')}>Kodları yeniden gönder</button>
            </>
          )}

          {info && <p className="info">{info}</p>}
        </div>

        <div className="loginFooter">
          <p className="loginFooterLabel">{STORE_APP_NAME}</p>
          <p className="loginFooterNote">{BRAND_SLOGAN}</p>
          <p className="loginFooterNote">{LOYALTY_PROMO}</p>
          {import.meta.env.DEV && (
            <p className="loginFooterNote loginDevHint">
              Yerel test — Yönetici: 555 010 00 02 veya 505 866 54 06 · Giriş PIN: 1234 · Yönetici PIN: 5454
            </p>
          )}
          <CafeContactBar compact />
        </div>
      </div>

      <div className="loginMenuDock">
        <button type="button" className="loginMenuBtn" onClick={() => setMenuOpen(true)}>
          <ShoppingBag size={20} aria-hidden="true" />
          Menüyü Gör
        </button>
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
