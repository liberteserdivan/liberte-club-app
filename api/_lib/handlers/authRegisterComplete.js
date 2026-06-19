import { getSql } from '../appState.js';
import { findReferrerByInviteCode } from '../referralCode.js';
import { applyCors, readBody } from '../http.js';
import { cleanPhone } from '../phone.js';
import { buildCustomerRecord, createSession, indexCustomerEmail, toCustomerSnapshot } from '../auth.js';
import { loadAppState, saveAppState } from '../appState.js';
import { loyaltyTemplate, applyCategoryStamp } from '../loyaltyOps.js';
import { verifyEmailCode } from '../emailCodes.js';
import { sendVerificationCode } from '../verificationMail.js';
import { isValidPinFormat, normalizePin, saveCustomerPin } from '../pinAuth.js';
import { enforceAuthRateLimit } from '../rateLimit.js';

function validEmail(v = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).toLowerCase());
}

// Kayıt öncesi — e-postaya doğrulama kodu gönder
async function handleSendCode(req, res) {
  if (await enforceAuthRateLimit(req, 'auth_send_code', { maxHits: 8 })) {
    return res.status(429).json({ error: 'Çok fazla kod isteği. Lütfen 15 dakika sonra tekrar dene.' });
  }

  const body = readBody(req);
  const phone = cleanPhone(body.phone);
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();

  if (phone.length < 10 || !validEmail(email)) {
    return res.status(400).json({ error: 'Telefon ve geçerli e-posta zorunlu' });
  }
  if (name.split(' ').filter(Boolean).length < 2) {
    return res.status(400).json({ error: 'İsim soyisim zorunlu' });
  }

  const remote = await loadAppState({ skipPersist: true });
  const state = remote.data || { customers: [] };
  const duplicatePhone = (state.customers || []).some((c) => cleanPhone(c.phone) === phone);
  const duplicateEmail = (state.customers || []).some(
    (c) => String(c.email || '').toLowerCase() === email
  );
  if (duplicatePhone || duplicateEmail) {
    return res.status(409).json({ error: 'Bu telefon veya e-posta zaten kayıtlı' });
  }

  const sent = await sendVerificationCode({
    email,
    phone,
    purpose: 'register',
    subject: 'Liberte kayıt doğrulama kodun',
    greeting: `Merhaba ${name.split(' ')[0]},`
  });

  if (!sent.ok) return res.status(sent.status || 500).json({ error: sent.error });

  return res.status(200).json({
    ok: true,
    emailMasked: sent.emailMasked,
    testCode: sent.testCode,
    warning: sent.warning
  });
}

// Kayıt tamamla — kodları doğrula, hesap oluştur
async function handleComplete(req, res) {
  const body = readBody(req);
  const phone = cleanPhone(body.phone);
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const pin = normalizePin(body.pin);
  const pinConfirm = normalizePin(body.pinConfirm);
  const code = String(body.code || '').replace(/\D/g, '');
  const birthDate = String(body.birthDate || '');
  const inviteCode = String(body.referralCode || body.inviteCode || '').trim().toUpperCase();
  const deviceId = String(body.deviceId || '').trim();

  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL eksik' });
  if (phone.length < 10 || !validEmail(email)) {
    return res.status(400).json({ error: 'Telefon ve geçerli e-posta zorunlu' });
  }
  if (name.split(' ').filter(Boolean).length < 2) {
    return res.status(400).json({ error: 'İsim soyisim zorunlu' });
  }
  if (!isValidPinFormat(pin)) {
    return res.status(400).json({ error: 'PIN 4 veya 6 haneli olmalı.' });
  }
  if (pin !== pinConfirm) {
    return res.status(400).json({ error: 'PIN tekrarı eşleşmiyor.' });
  }
  if (code.length !== 6) {
    return res.status(400).json({ error: '6 haneli doğrulama kodunu gir.' });
  }

  const remote = await loadAppState({ skipPersist: true });
  const state = remote.data || { customers: [], loyalty: {}, history: [] };

  const duplicatePhone = (state.customers || []).some((c) => cleanPhone(c.phone) === phone);
  const duplicateEmail = (state.customers || []).some(
    (c) => String(c.email || '').toLowerCase() === email
  );
  if (duplicatePhone || duplicateEmail) {
    return res.status(409).json({ error: 'Bu telefon veya e-posta zaten kayıtlı' });
  }

  const sql = getSql();
  if (!sql) return res.status(500).json({ error: 'DATABASE_URL eksik' });
  const verified = await verifyEmailCode(sql, {
    email,
    phone,
    code,
    purpose: 'register'
  });
  if (!verified.ok) return res.status(verified.status).json({ error: verified.error });

  const referrer = findReferrerByInviteCode(state.customers, inviteCode);

  const customer = buildCustomerRecord({
    phone,
    email,
    name,
    birthDate,
    referredBy: referrer?.id || null,
    isAdmin: false
  }, state.customers);

  state.customers = [...(state.customers || []), customer];
  state.loyalty = { ...(state.loyalty || {}), [customer.id]: loyaltyTemplate(customer.id) };
  applyCategoryStamp(state, customer.id, 'coffee', 2, 'Yeni üye hoş geldin bonusu');

  if (referrer) {
    applyCategoryStamp(state, customer.id, 'coffee', 2, 'Referans kayıt bonusu');
    applyCategoryStamp(state, referrer.id, 'coffee', 2, `${customer.name} referans kaydı`);
    state.referrals = [
      {
        id: Date.now(),
        referrerId: referrer.id,
        customerId: customer.id,
        createdAt: new Date().toLocaleString('tr-TR')
      },
      ...(state.referrals || [])
    ];
  }

  state.history = [
    {
      id: Date.now(),
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      type: 'register',
      count: 0,
      source: 'Uygulama kayıt',
      createdAt: new Date().toLocaleString('tr-TR')
    },
    ...(state.history || [])
  ];

  await saveAppState(state);
  await saveCustomerPin(sql, phone, customer.id, pin);
  await indexCustomerEmail(customer);

  const session = await createSession(res, {
    customerId: customer.id,
    role: 'user',
    deviceId
  });

  const loyaltyCard = state.loyalty?.[customer.id] || state.loyalty?.[String(customer.id)] || null;

  return res.status(200).json({
    ok: true,
    customerId: customer.id,
    role: session.role,
    isAdmin: false,
    adminVerified: false,
    sessionToken: session.token,
    customer: toCustomerSnapshot(customer),
    loyalty: loyaltyCard
  });
}

// Kayıt — kod gönder veya doğrulayıp tamamla
export async function handleAuthRegisterComplete(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = readBody(req);
    const action = String(body.action || 'complete').trim();

    if (action === 'send-code') return await handleSendCode(req, res);
    if (action === 'complete') return await handleComplete(req, res);

    return res.status(400).json({ error: 'Geçersiz işlem' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Kayıt tamamlanamadı' });
  }
}
