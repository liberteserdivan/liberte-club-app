import { getSql } from '../appState.js';
import { applyCors, readBody } from '../http.js';
import { cleanPhone } from '../phone.js';
import { createSession, toCustomerSnapshot } from '../auth.js';
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
  normalizeEmail,
  upsertCustomerEmail
} from '../customerEmails.js';
import {
  buildNewCustomerRecord,
  buildWelcomeLoyalty,
  findCustomerByReferralCode,
  findLoyaltyByCustomerId,
  loyaltyRowToCard,
  resolveRegistrationDuplicate,
  upsertCustomerRow,
  upsertLoyaltyRow,
  applyReferrerBonus
} from '../customersStore.js';
import { queueRegisterAppStateSync } from '../registerAppStateSync.js';
import { useRelationalState } from '../relationalConfig.js';

function validEmail(v = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).toLowerCase());
}

// Kayıt hatasını logla
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

// Mevcut referans kodlarını oku — yeni kod üretimi için
async function listExistingReferralCodes(sql) {
  const rows = await sql`
    SELECT referral_code
    FROM customers
    WHERE referral_code IS NOT NULL
  `;
  return rows.map((r) => String(r.referral_code || '').toUpperCase()).filter(Boolean);
}

// Kayıt öncesi — e-postaya doğrulama kodu gönder (app_state yok)
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

  trace.markStep('send_code_check_index');
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

  trace.markStep('customer_find');
  const conflict = await resolveRegistrationDuplicate(sql, phone, email);
  if (conflict.blocked) {
    return res.status(409).json(trace.failBody('duplicate', 'DUPLICATE', conflict.reason || 'Bu telefon veya e-posta zaten kayıtlı'));
  }

  trace.markStep('send_code_mail');
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

  trace.log('send_code_ok');
  return res.status(200).json({
    ok: true,
    requestId: trace.requestId,
    emailMasked: sent.emailMasked,
    testCode: sent.testCode,
    warning: sent.warning,
    timings: trace.successTimings()
  });
}

// Kayıt tamamla — normalize tablolara yaz, app_state arka planda
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

  trace.markStep('verify_code_start');
  const verified = await verifyEmailCode(sql, { email, phone, code, purpose: 'register' });
  trace.markStep('verify_code');
  if (!verified.ok) {
    return res.status(verified.status).json(trace.failBody('verify_code', 'CODE_INVALID', verified.error));
  }
  trace.markStep('email_code_mark_used');

  trace.markStep('customer_find_start');
  const conflict = await resolveRegistrationDuplicate(sql, phone, email);
  trace.markStep('customer_find');
  if (conflict.blocked) {
    return res.status(409).json(trace.failBody('duplicate', 'ALREADY_REGISTERED', conflict.reason || 'Bu telefon veya e-posta zaten kayıtlı'));
  }

  const referrer = await findCustomerByReferralCode(sql, inviteCode);
  let customer = conflict.resumeCustomer;
  const isNewCustomer = !customer;

  if (!customer) {
    trace.markStep('customer_create_start');
    const existingCodes = await listExistingReferralCodes(sql);
    customer = buildNewCustomerRecord({
      phone,
      email,
      name,
      birthDate,
      referredBy: referrer?.id || null,
      existingCodes
    });
    trace.markStep('customer_create');
  } else {
    customer = {
      ...customer,
      phone,
      email,
      name,
      birthDate: birthDate || customer.birthDate || ''
    };
    trace.markStep('customer_create');
  }

  let loyaltyCard;
  if (isNewCustomer) {
    trace.markStep('loyalty_init_start');
    loyaltyCard = buildWelcomeLoyalty(customer.id, referrer ? 2 : 0);
    trace.markStep('loyalty_init');
  } else {
    const existingLoyalty = await findLoyaltyByCustomerId(sql, customer.id);
    loyaltyCard = loyaltyRowToCard(existingLoyalty, customer.id);
    trace.markStep('loyalty_init');
  }

  trace.markStep('auth_transaction_start');
  let session;
  try {
    await sql.begin(async (tx) => {
      trace.markStep('customer_upsert_start');
      await upsertCustomerRow(tx, customer);
      trace.markStep('customer_upsert');

      if (isNewCustomer) {
        await upsertLoyaltyRow(tx, customer.id, loyaltyCard);
      }

      trace.markStep('pin_auth_upsert_start');
      await saveCustomerPin(tx, phone, customer.id, pin);
      trace.markStep('pin_auth_upsert');

      trace.markStep('customer_email_upsert_start');
      await upsertCustomerEmail(tx, {
        email: customer.email,
        customerId: customer.id,
        phone: customer.phone
      });
      trace.markStep('customer_email_upsert');

      const role = customer.isAdmin ? 'admin' : 'user';
      trace.markStep('auth_session_create_start');
      session = await createSession(res, {
        customerId: customer.id,
        role,
        deviceId,
        sql: tx
      });
      trace.markStep('auth_session_create');
    });
  } catch (error) {
    await logRegisterFailure(trace, 'auth_session_create', error, { email, phone });
    return res.status(500).json(trace.failBody('auth_session_create', 'REGISTER_FINAL_FAILED', 'Kayıt tamamlanamadı. Lütfen tekrar dene.'));
  }

  if (isNewCustomer && referrer) {
    try {
      await applyReferrerBonus(sql, referrer.id, customer.name);
    } catch (error) {
      console.warn('[register.referrer_bonus]', trace.requestId, error?.message || error);
    }
  }

  const historyEntry = isNewCustomer
    ? {
        id: Date.now(),
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        type: 'register',
        count: 0,
        source: 'Uygulama kayıt',
        createdAt: new Date().toLocaleString('tr-TR')
      }
    : null;

  if (!useRelationalState()) {
    queueRegisterAppStateSync(
      { customer, loyalty: loyaltyCard, historyEntry, referrer },
      trace.requestId
    );
  }

  const timings = trace.successTimings();
  trace.log('complete_ok', { customerId: customer.id, ...timings });

  return res.status(200).json({
    ok: true,
    requestId: trace.requestId,
    customerId: customer.id,
    role: session.role,
    isAdmin: Boolean(customer.isAdmin),
    adminVerified: false,
    sessionToken: session.token,
    next: 'home',
    customer: toCustomerSnapshot(customer),
    loyalty: loyaltyCard,
    timings
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
