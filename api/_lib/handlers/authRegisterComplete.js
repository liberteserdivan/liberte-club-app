import { getSql } from '../appState.js';
import { findReferrerByInviteCode } from '../referralCode.js';
import { applyCors, readBody } from '../http.js';
import { cleanPhone } from '../phone.js';
import {
  buildCustomerRecord,
  createSession,
  indexCustomerEmail,
  toCustomerSnapshot
} from '../auth.js';
import { loadAppState, patchAppStateRegistration } from '../appState.js';
import { loyaltyTemplate, applyCategoryStamp } from '../loyaltyOps.js';
import { verifyEmailCode } from '../emailCodes.js';
import { sendVerificationCode } from '../verificationMail.js';
import { isValidPinFormat, normalizePin, saveCustomerPin } from '../pinAuth.js';
import { enforceAuthRateLimit } from '../rateLimit.js';
import { logServerError } from '../logServerError.js';
import { createRequestTrace } from '../requestTrace.js';
import {
  findCustomerIdByEmail,
  findCustomerIdByPhone,
  hasCustomerPinAuth,
  listCustomers,
  normalizeEmail,
  upsertCustomerEmail
} from '../customerEmails.js';

function validEmail(v = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).toLowerCase());
}

// Kayıt hatasını logla — app_error_logs
async function logRegisterFailure(trace, step, error, extra = {}) {
  trace.log(`error:${step}`, { message: error?.message || String(error) });
  await logServerError({
    source: 'register_final',
    error,
    detail: {
      requestId: trace.requestId,
      step,
      durationMs: trace.durationMs(),
      ...extra
    }
  });
}

// app_state içinde telefon/e-posta çakışması var mı?
function findStateCustomer(state, phone, email) {
  const customers = listCustomers(state);
  const byPhone = customers.find((c) => cleanPhone(c.phone) === phone) || null;
  const byEmail = customers.find((c) => normalizeEmail(c.email) === email) || null;
  return { byPhone, byEmail };
}

// Tamamlanmış kayıt mı yoksa yarım kalmış mı?
async function resolveRegistrationConflict(sql, state, phone, email) {
  const { byPhone, byEmail } = findStateCustomer(state, phone, email);

  if (byPhone && byEmail && Number(byPhone.id) !== Number(byEmail.id)) {
    return { blocked: true, reason: 'Bu telefon ve e-posta farklı hesaplara ait.' };
  }

  const existing = byPhone || byEmail;
  if (!existing) {
    const indexedEmail = await findCustomerIdByEmail(email);
    const indexedPhone = await findCustomerIdByPhone(sql, phone);
    if (indexedEmail && indexedPhone && Number(indexedEmail.customer_id) !== Number(indexedPhone.customer_id)) {
      return { blocked: true, reason: 'Bu telefon ve e-posta farklı hesaplara ait.' };
    }
    const indexed = indexedEmail || indexedPhone;
    if (indexed && await hasCustomerPinAuth(sql, phone)) {
      return { blocked: true, reason: 'Bu telefon veya e-posta zaten kayıtlı' };
    }
    return { blocked: false, resumeCustomer: null };
  }

  if (await hasCustomerPinAuth(sql, phone)) {
    return { blocked: true, reason: 'Bu telefon veya e-posta zaten kayıtlı' };
  }

  return { blocked: false, resumeCustomer: existing };
}

// Kayıt öncesi — e-postaya doğrulama kodu gönder
async function handleSendCode(req, res, trace) {
  if (await enforceAuthRateLimit(req, 'auth_send_code', { maxHits: 8 })) {
    return res.status(429).json(trace.failBody('rate_limit', 'RATE_LIMITED', 'Çok fazla kod isteği. Lütfen 15 dakika sonra tekrar dene.'));
  }

  const body = readBody(req);
  const phone = cleanPhone(body.phone);
  const email = normalizeEmail(body.email);
  const name = String(body.name || '').trim();

  if (phone.length < 10 || !validEmail(email)) {
    return res.status(400).json(trace.failBody('validate', 'VALIDATION', 'Telefon ve geçerli e-posta zorunlu'));
  }
  if (name.split(' ').filter(Boolean).length < 2) {
    return res.status(400).json(trace.failBody('validate', 'VALIDATION', 'İsim soyisim zorunlu'));
  }

  const sql = getSql();
  if (!sql) {
    return res.status(500).json(trace.failBody('database', 'DATABASE_URL', 'Veritabanı yapılandırması eksik'));
  }

  trace.log('send_code.check_index');
  if (await hasCustomerPinAuth(sql, phone)) {
    return res.status(409).json(trace.failBody('duplicate', 'DUPLICATE', 'Bu telefon veya e-posta zaten kayıtlı'));
  }

  const indexedEmail = await findCustomerIdByEmail(email);
  const indexedPhone = await findCustomerIdByPhone(sql, phone);
  if (indexedEmail && await hasCustomerPinAuth(sql, indexedEmail.phone || phone)) {
    return res.status(409).json(trace.failBody('duplicate', 'DUPLICATE', 'Bu telefon veya e-posta zaten kayıtlı'));
  }
  if (indexedPhone && await hasCustomerPinAuth(sql, phone)) {
    return res.status(409).json(trace.failBody('duplicate', 'DUPLICATE', 'Bu telefon veya e-posta zaten kayıtlı'));
  }

  trace.log('send_code.load_state');
  const remote = await loadAppState({ skipPersist: true, skipCache: true });
  const state = remote.data || { customers: [] };
  const conflict = await resolveRegistrationConflict(sql, state, phone, email);
  if (conflict.blocked) {
    return res.status(409).json(trace.failBody('duplicate', 'DUPLICATE', conflict.reason || 'Bu telefon veya e-posta zaten kayıtlı'));
  }

  trace.log('send_code.mail');
  const sent = await sendVerificationCode({
    email,
    phone,
    purpose: 'register',
    subject: 'Liberte kayıt doğrulama kodun',
    greeting: `Merhaba ${name.split(' ')[0]},`
  });

  if (!sent.ok) {
    return res.status(sent.status || 500).json(trace.failBody('send_mail', 'MAIL_FAILED', sent.error || 'Kod gönderilemedi'));
  }

  trace.log('send_code.ok');
  return res.status(200).json({
    ok: true,
    requestId: trace.requestId,
    emailMasked: sent.emailMasked,
    testCode: sent.testCode,
    warning: sent.warning
  });
}

// Yeni müşteri veya yarım kalmış kayıt için state güncelle
function applyRegistrationToState(state, customer, referrer) {
  const next = { ...state };
  const customers = listCustomers(next);
  const exists = customers.some((c) => Number(c.id) === Number(customer.id));
  next.customers = exists
    ? customers.map((c) => (Number(c.id) === Number(customer.id) ? { ...c, ...customer } : c))
    : [...customers, customer];

  if (!next.loyalty?.[customer.id] && !next.loyalty?.[String(customer.id)]) {
    next.loyalty = { ...(next.loyalty || {}), [customer.id]: loyaltyTemplate(customer.id) };
    applyCategoryStamp(next, customer.id, 'coffee', 2, 'Yeni üye hoş geldin bonusu');
  }

  if (referrer) {
    applyCategoryStamp(next, customer.id, 'coffee', 2, 'Referans kayıt bonusu');
    applyCategoryStamp(next, referrer.id, 'coffee', 2, `${customer.name} referans kaydı`);
    next.referrals = [
      {
        id: Date.now(),
        referrerId: referrer.id,
        customerId: customer.id,
        createdAt: new Date().toLocaleString('tr-TR')
      },
      ...(next.referrals || [])
    ];
  }

  if (!exists) {
    next.history = [
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
      ...(next.history || [])
    ];
  }

  return next;
}

// Kayıt tamamla — kodları doğrula, hesap oluştur
async function handleComplete(req, res, trace) {
  const body = readBody(req);
  const phone = cleanPhone(body.phone);
  const email = normalizeEmail(body.email);
  const name = String(body.name || '').trim();
  const pin = normalizePin(body.pin);
  const pinConfirm = normalizePin(body.pinConfirm);
  const code = String(body.code || '').replace(/\D/g, '');
  const birthDate = String(body.birthDate || '');
  const inviteCode = String(body.referralCode || body.inviteCode || '').trim().toUpperCase();
  const deviceId = String(body.deviceId || '').trim();

  if (!process.env.DATABASE_URL) {
    return res.status(500).json(trace.failBody('database', 'DATABASE_URL', 'Veritabanı yapılandırması eksik'));
  }
  if (phone.length < 10 || !validEmail(email)) {
    return res.status(400).json(trace.failBody('validate', 'VALIDATION', 'Telefon ve geçerli e-posta zorunlu'));
  }
  if (name.split(' ').filter(Boolean).length < 2) {
    return res.status(400).json(trace.failBody('validate', 'VALIDATION', 'İsim soyisim zorunlu'));
  }
  if (!isValidPinFormat(pin)) {
    return res.status(400).json(trace.failBody('validate', 'VALIDATION', 'PIN 4 veya 6 haneli olmalı.'));
  }
  if (pin !== pinConfirm) {
    return res.status(400).json(trace.failBody('validate', 'VALIDATION', 'PIN tekrarı eşleşmiyor.'));
  }
  if (code.length !== 6) {
    return res.status(400).json(trace.failBody('validate', 'VALIDATION', '6 haneli doğrulama kodunu gir.'));
  }

  if (await enforceAuthRateLimit(req, 'auth_register_complete', { maxHits: 12 })) {
    return res.status(429).json(trace.failBody('rate_limit', 'RATE_LIMITED', 'Çok fazla deneme. Lütfen bir süre sonra tekrar dene.'));
  }

  const sql = getSql();
  if (!sql) {
    return res.status(500).json(trace.failBody('database', 'DATABASE_URL', 'Veritabanı yapılandırması eksik'));
  }

  trace.log('verify_code', { email });
  const verified = await verifyEmailCode(sql, { email, phone, code, purpose: 'register' });
  if (!verified.ok) {
    return res.status(verified.status).json(trace.failBody('verify_code', 'CODE_INVALID', verified.error));
  }
  trace.log('email_code_mark_used', { email });

  trace.log('load_app_state');
  const remote = await loadAppState({ skipPersist: true, skipCache: true });
  const state = remote.data || { customers: [], loyalty: {}, history: [] };

  trace.log('customer_create_or_find');
  const conflict = await resolveRegistrationConflict(sql, state, phone, email);
  if (conflict.blocked) {
    return res.status(409).json(trace.failBody('duplicate', 'ALREADY_REGISTERED', conflict.reason || 'Bu telefon veya e-posta zaten kayıtlı'));
  }

  const referrer = findReferrerByInviteCode(listCustomers(state), inviteCode);
  let customer = conflict.resumeCustomer;

  if (!customer) {
    customer = buildCustomerRecord({
      phone,
      email,
      name,
      birthDate,
      referredBy: referrer?.id || null,
      isAdmin: false
    }, listCustomers(state));
  } else {
    customer = {
      ...customer,
      phone,
      email,
      name,
      birthDate: birthDate || customer.birthDate || ''
    };
  }

  const nextState = applyRegistrationToState(
    { customers: [], loyalty: {}, history: [], referrals: [] },
    customer,
    referrer
  );
  const historyEntry = nextState.history?.[0] || null;
  const referralEntry = referrer ? nextState.referrals?.[0] || null : null;
  const extraLoyaltyEntries = referrer && nextState.loyalty?.[referrer.id]
    ? { [String(referrer.id)]: nextState.loyalty[referrer.id] }
    : {};

  const loyaltyCard = conflict.resumeCustomer
    ? (state.loyalty?.[customer.id] || state.loyalty?.[String(customer.id)] || loyaltyTemplate(customer.id))
    : (nextState.loyalty?.[customer.id] || nextState.loyalty?.[String(customer.id)] || null);

  trace.log('loyalty_init', { customerId: customer.id });
  if (conflict.resumeCustomer) {
    trace.log('save_app_state_resume_skip', { customerId: customer.id });
  } else {
    trace.log('patch_app_state');
    await patchAppStateRegistration(sql, {
      customer,
      loyaltyEntry: loyaltyCard,
      historyEntry,
      referralEntry,
      extraLoyaltyEntries
    });
  }

  trace.log('auth_transaction_start');
  let session;
  try {
    await sql.begin(async (tx) => {
      trace.log('pin_auth_upsert', { customerId: customer.id });
      await saveCustomerPin(tx, phone, customer.id, pin);
      trace.log('customer_email_upsert', { customerId: customer.id });
      await upsertCustomerEmail(tx, {
        email: customer.email,
        customerId: customer.id,
        phone: customer.phone
      });
      trace.log('auth_session_create', { customerId: customer.id });
      session = await createSession(res, {
        customerId: customer.id,
        role: 'user',
        deviceId,
        sql: tx
      });
    });
  } catch (error) {
    await logRegisterFailure(trace, 'auth_session_create', error, { email, phone });
    return res.status(500).json(trace.failBody('auth_session_create', 'REGISTER_FINAL_FAILED', 'Kayıt tamamlanamadı. Lütfen tekrar dene.'));
  }

  trace.log('complete_ok', { customerId: customer.id });

  return res.status(200).json({
    ok: true,
    requestId: trace.requestId,
    customerId: customer.id,
    role: session.role,
    isAdmin: false,
    adminVerified: false,
    sessionToken: session.token,
    next: 'home',
    customer: toCustomerSnapshot(customer),
    loyalty: loyaltyCard
  });
}

// Kayıt — kod gönder veya doğrulayıp tamamla
export async function handleAuthRegisterComplete(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const trace = createRequestTrace('auth.register-complete');

  try {
    const body = readBody(req);
    const action = String(body.action || 'complete').trim();

    if (action === 'send-code') return await handleSendCode(req, res, trace);
    if (action === 'complete') return await handleComplete(req, res, trace);

    return res.status(400).json(trace.failBody('action', 'INVALID_ACTION', 'Geçersiz işlem'));
  } catch (e) {
    console.error('[auth.register-complete]', trace.requestId, e?.stack || e?.message || e);
    await logRegisterFailure(trace, 'unexpected', e);
    return res.status(500).json(trace.failBody('unexpected', 'REGISTER_FINAL_FAILED', e.message || 'Kayıt tamamlanamadı'));
  }
}
