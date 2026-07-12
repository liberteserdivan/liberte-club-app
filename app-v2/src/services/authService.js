import { apiJson, AUTH_REQUEST_OPTIONS, readApiError, getStoredAuthToken } from '../lib/apiClient.js';
import { getDeviceId } from '../lib/deviceId.js';
import { applyAuthResult, clearSession, saveQuickLogin } from '../lib/sessionStore.js';
import { digitsOnly } from '../lib/phoneMask.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Geçici 503 ile login — kısa backoff
export async function loginWithPin(phone, pin) {
  const body = JSON.stringify({
    phone: digitsOnly(phone),
    pin: digitsOnly(pin),
    deviceId: getDeviceId()
  });
  const opts = {
    ...AUTH_REQUEST_OPTIONS,
    method: 'POST',
    body,
    skipUnauthorized: true,
    omitAuth: true
  };

  let last = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await sleep(900);
    last = await apiJson('/api/auth/login', opts);
    const transient = last.response.status === 503
      || last.data?.code === 'LOGIN_TEMPORARILY_UNAVAILABLE'
      || last.data?.code === 'DATABASE_TRANSIENT';
    if (!transient) break;
  }

  if (!last.response.ok || last.data?.ok === false) {
    const err = new Error(readApiError(last.data, 'Giriş yapılamadı'));
    err.code = last.data?.code || null;
    err.httpStatus = last.response.status;
    throw err;
  }

  const session = applyAuthResult(last.data);
  saveQuickLogin(phone, pin);
  return { session, data: last.data };
}

export async function restoreSession() {
  const token = getStoredAuthToken();
  if (!token) return null;

  const { response, data } = await apiJson('/api/auth/session', {
    ...AUTH_REQUEST_OPTIONS,
    method: 'GET',
    skipUnauthorized: true
  });

  if (response.status === 401) {
    clearSession();
    return null;
  }
  if (!response.ok || data?.ok === false) {
    return null;
  }

  return applyAuthResult(data);
}

export async function sendRegisterCode({ phone, name, email }) {
  const { response, data } = await apiJson('/api/auth/register-complete', {
    ...AUTH_REQUEST_OPTIONS,
    method: 'POST',
    skipUnauthorized: true,
    omitAuth: true,
    body: JSON.stringify({
      action: 'send-code',
      phone: digitsOnly(phone),
      name,
      email
    })
  });
  if (!response.ok) {
    throw new Error(readApiError(data, 'Kod gönderilemedi'));
  }
  return data;
}

export async function completeRegister({ phone, name, email, pin, code, referralCode }) {
  const { response, data } = await apiJson('/api/auth/register-complete', {
    ...AUTH_REQUEST_OPTIONS,
    method: 'POST',
    skipUnauthorized: true,
    omitAuth: true,
    body: JSON.stringify({
      action: 'complete',
      phone: digitsOnly(phone),
      name,
      email,
      pin: digitsOnly(pin),
      code,
      referralCode: referralCode || undefined,
      deviceId: getDeviceId()
    })
  });
  if (!response.ok || data?.ok === false) {
    throw new Error(readApiError(data, 'Kayıt tamamlanamadı'));
  }
  const session = applyAuthResult(data);
  saveQuickLogin(phone, pin);
  return { session, data };
}

export async function requestForgotPin({ phoneOrEmail }) {
  const { response, data } = await apiJson('/api/auth/forgot-pin', {
    ...AUTH_REQUEST_OPTIONS,
    method: 'POST',
    skipUnauthorized: true,
    omitAuth: true,
    body: JSON.stringify({ action: 'send-code', phoneOrEmail })
  });
  if (!response.ok) throw new Error(readApiError(data, 'Kod gönderilemedi'));
  return data;
}

export async function resetPin({ phoneOrEmail, code, pin }) {
  const { response, data } = await apiJson('/api/auth/forgot-pin', {
    ...AUTH_REQUEST_OPTIONS,
    method: 'POST',
    skipUnauthorized: true,
    omitAuth: true,
    body: JSON.stringify({
      action: 'reset',
      phoneOrEmail,
      code,
      pin: digitsOnly(pin),
      deviceId: getDeviceId()
    })
  });
  if (!response.ok || data?.ok === false) {
    throw new Error(readApiError(data, 'PIN sıfırlanamadı'));
  }
  return applyAuthResult(data);
}

export async function verifyAdminPin(pin) {
  const { response, data } = await apiJson('/api/auth/admin-pin', {
    method: 'POST',
    body: JSON.stringify({ pin: digitsOnly(pin) }),
    timeoutMs: 15000
  });
  if (!response.ok || data?.ok === false) {
    throw new Error(readApiError(data, 'Yönetici PIN hatalı'));
  }
  return data;
}
