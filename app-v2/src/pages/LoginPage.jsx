import { useEffect, useRef, useState } from 'react';
import { CLUB_APP_NAME } from '../lib/constants.js';
import { formatPhoneInput, formatPinInput, digitsOnly } from '../lib/phoneMask.js';
import { hasQuickLogin, readSavedPhone, readSavedPin } from '../lib/sessionStore.js';
import { getAuthEpoch } from '../lib/authEpoch.js';
import {
  loginWithPin,
  sendRegisterCode,
  completeRegister,
  requestForgotPin,
  resetPin
} from '../services/authService.js';

export default function LoginPage({ onAuthed, showToast }) {
  const [mode, setMode] = useState('login');
  const [phone, setPhone] = useState(() => formatPhoneInput(readSavedPhone()));
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [registerStep, setRegisterStep] = useState('form');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState('');
  const [autoPending, setAutoPending] = useState(() => hasQuickLogin());
  const [autoStep, setAutoStep] = useState(0);
  const startedRef = useRef(false);
  const attemptRef = useRef(0);
  const inFlightRef = useRef(false);

  async function doLogin(explicitPhone, explicitPin) {
    const ph = digitsOnly(explicitPhone || phone);
    const pinValue = digitsOnly(explicitPin || pin);
    if (ph.length < 10 || !(pinValue.length === 4 || pinValue.length === 6)) {
      setAutoPending(false);
      showToast('Telefon ve PIN gerekli', 'error');
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const attemptId = attemptRef.current + 1;
    attemptRef.current = attemptId;
    const epoch = getAuthEpoch();
    setLoading(true);
    try {
      const { session } = await loginWithPin(ph, pinValue);
      if (attemptId !== attemptRef.current) return;
      if (getAuthEpoch() !== epoch && getAuthEpoch() < epoch) return;
      setAutoPending(false);
      onAuthed(session);
    } catch (err) {
      setAutoPending(false);
      showToast(err.message || 'Giriş yapılamadı', 'error');
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (startedRef.current || mode !== 'login' || !hasQuickLogin()) return;
    startedRef.current = true;
    const ph = digitsOnly(readSavedPhone());
    const pinValue = readSavedPin();
    if (ph.length < 10 || !pinValue) {
      setAutoPending(false);
      return;
    }
    setPhone(formatPhoneInput(ph));
    setPin(pinValue);
    setAutoPending(true);
    void doLogin(ph, pinValue);
  }, [mode]);

  useEffect(() => {
    if (!autoPending) {
      setAutoStep(0);
      return undefined;
    }
    const t1 = setTimeout(() => setAutoStep(1), 1400);
    const t2 = setTimeout(() => setAutoStep(2), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [autoPending]);

  function cancelAuto() {
    attemptRef.current += 1;
    inFlightRef.current = false;
    setAutoPending(false);
    setLoading(false);
    setPin('');
  }

  async function onSendRegister() {
    setLoading(true);
    setInfo('');
    try {
      const data = await sendRegisterCode({ phone, name, email });
      setRegisterStep('verify');
      setInfo(data.testCode ? `Test kodu: ${data.testCode}` : 'Doğrulama kodu e-postana gönderildi.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function onCompleteRegister() {
    if (pin !== pinConfirm) {
      showToast('PIN doğrulaması eşleşmiyor', 'error');
      return;
    }
    setLoading(true);
    try {
      const { session } = await completeRegister({
        phone, name, email, pin, code, referralCode
      });
      onAuthed(session);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function onForgotSend() {
    setLoading(true);
    try {
      const data = await requestForgotPin({ phoneOrEmail: phone || email });
      setInfo(data.testCode ? `Test kodu: ${data.testCode}` : 'Kod e-postana gönderildi.');
      setRegisterStep('verify');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function onForgotReset() {
    setLoading(true);
    try {
      const session = await resetPin({ phoneOrEmail: phone || email, code, pin });
      onAuthed(session);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="loginPage" data-testid="login-page">
      <div className="loginCard">
        <div className="brandMark">{CLUB_APP_NAME}</div>
        <h1>{autoPending ? CLUB_APP_NAME : (mode === 'login' ? 'Giriş Yap' : mode === 'register' ? 'Kayıt Ol' : 'PIN Sıfırla')}</h1>
        <p>{autoPending ? 'Seni içeri alıyoruz…' : 'Telefon ve kişisel PIN ile devam et.'}</p>

        {!autoPending && mode !== 'forgot' && (
          <div className="authSwitch">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Giriş</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setRegisterStep('form'); }}>Kayıt</button>
          </div>
        )}

        {mode === 'login' && autoPending && (
          <div className="autoLogin" data-testid="login-auto-restore">
            <div className="spin" aria-hidden="true" />
            <strong>Otomatik giriş</strong>
            <p className="muted">Kayıtlı hesap doğrulanıyor.</p>
            <ul className="autoSteps">
              <li className={autoStep > 0 ? 'done' : 'active'}>Hesap kontrolü</li>
              <li className={autoStep > 1 ? 'done' : (autoStep === 1 ? 'active' : '')}>Oturum açılışı</li>
              <li className={autoStep >= 2 ? 'active' : ''}>Ana sayfa</li>
            </ul>
            <button type="button" className="ghost" onClick={cancelAuto}>Manuel girişe geç</button>
          </div>
        )}

        {mode === 'login' && !autoPending && (
          <>
            <label>Telefon</label>
            <input data-testid="login-phone" value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} inputMode="tel" />
            <label>PIN</label>
            <input data-testid="login-pin" type="password" value={pin} onChange={(e) => setPin(formatPinInput(e.target.value))} inputMode="numeric" />
            <button data-testid="login-submit" type="button" disabled={loading} onClick={() => doLogin()}>
              {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
            </button>
            <button type="button" className="ghost" onClick={() => { setMode('forgot'); setRegisterStep('form'); }}>PIN&apos;imi unuttum</button>
          </>
        )}

        {mode === 'register' && registerStep === 'form' && (
          <>
            <label>Ad Soyad</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <label>Telefon</label>
            <input value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} />
            <label>E-posta</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
            <label>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(formatPinInput(e.target.value))} />
            <label>PIN tekrar</label>
            <input type="password" value={pinConfirm} onChange={(e) => setPinConfirm(formatPinInput(e.target.value))} />
            <label>Davet kodu (opsiyonel)</label>
            <input value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} />
            <button type="button" disabled={loading} onClick={onSendRegister}>{loading ? 'Gönderiliyor…' : 'Kod Gönder'}</button>
          </>
        )}

        {mode === 'register' && registerStep === 'verify' && (
          <>
            {info && <div className="infoBox">{info}</div>}
            <label>Doğrulama kodu</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="button" disabled={loading} onClick={onCompleteRegister}>{loading ? 'Kaydediliyor…' : 'Kaydı Tamamla'}</button>
          </>
        )}

        {mode === 'forgot' && registerStep === 'form' && (
          <>
            <label>Telefon veya e-posta</label>
            <input value={phone || email} onChange={(e) => {
              const v = e.target.value;
              if (v.includes('@')) setEmail(v);
              else setPhone(formatPhoneInput(v));
            }} />
            <button type="button" disabled={loading} onClick={onForgotSend}>{loading ? 'Gönderiliyor…' : 'Kod Gönder'}</button>
            <button type="button" className="ghost" onClick={() => setMode('login')}>Geri</button>
          </>
        )}

        {mode === 'forgot' && registerStep === 'verify' && (
          <>
            {info && <div className="infoBox">{info}</div>}
            <label>Kod</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} />
            <label>Yeni PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(formatPinInput(e.target.value))} />
            <button type="button" disabled={loading} onClick={onForgotReset}>{loading ? 'Kaydediliyor…' : 'PIN Sıfırla'}</button>
          </>
        )}
      </div>
    </section>
  );
}
