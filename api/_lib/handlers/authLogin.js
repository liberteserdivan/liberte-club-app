import { getSql } from '../appState.js';
import { applyCors, readBody } from '../http.js';
import { cleanPhone } from '../phone.js';
import { enforceAuthRateLimit } from '../rateLimit.js';
import { createRequestTrace } from '../requestTrace.js';
import { hasCustomerPinAuth } from '../customerEmails.js';
import {
  createSession,
  getSession,
  indexCustomerEmail,
  readAuthToken,
  toCustomerSnapshot,
  findCustomerByPhone
} from '../auth.js';
import { isValidPinFormat, normalizePin, verifyCustomerPin } from '../pinAuth.js';
import { findLoyaltyByCustomerId, loyaltyRowToCard } from '../customersStore.js';
import { withRealtimeToken } from '../supabaseRealtimeJwt.js';
import { publicDbErrorCode, publicDbErrorMessage, withSqlRetry } from '../dbTransient.js';
import { resetSqlClient, primeSqlConnection } from '../sql.js';

// Oturumdaki müşteri girilen telefonla eşleşiyor mu?
function sessionMatchesPhone(session, normalizedPhone) {
  if (!session?.customer?.phone) return false;
  return cleanPhone(session.customer.phone) === normalizedPhone;
}

// Başarılı giriş yanıtının çekirdek alanları (DB/imza gerektirmez).
// Oturum zaten oluşturulduğu (cookie + DB satırı yazıldığı) için bu gövde
// her koşulda güvenle dönebilir; sadakat kartı opsiyoneldir.
function loginBodyCore(trace, customer, sessionMeta, existing, loyalty) {
  return {
    ok: true,
    requestId: trace.requestId,
    customerId: customer.id,
    role: sessionMeta.role,
    isAdmin: Boolean(customer.isAdmin),
    adminVerified: Boolean(existing?.adminVerified),
    sessionToken: sessionMeta.token || undefined,
    next: 'home',
    customer: toCustomerSnapshot(customer),
    loyalty,
    timings: trace.successTimings()
  };
}

// Minimal başarı gövdesi — DB veya realtime token üretimi BAŞARISIZ olsa bile
// dönülebilir. Oturum oluştuktan sonra 500 yerine bunu kullanırız.
function buildPlainLoginBody(trace, customer, sessionMeta, existing = null) {
  const core = loginBodyCore(trace, customer, sessionMeta, existing, null);
  try {
    // realtime token imzası başarısız olabilir — opsiyonel, login'i bloklamaz
    return withRealtimeToken(core, {
      customerId: customer.id,
      isAdmin: Boolean(customer.isAdmin),
      adminVerified: Boolean(existing?.adminVerified)
    });
  } catch {
    return core;
  }
}

// Başarılı giriş yanıtını oluştur — sadakat kartı dahil.
// Sadakat sorgusu non-fatal: hata/timeout olursa loyalty null döner, login bozulmaz
// (istemci kartı /api/state ile yine çeker).
async function buildLoginSuccessBody(trace, customer, sessionMeta, existing = null) {
  const sql = getSql();
  let loyalty = null;
  if (sql && customer?.id) {
    try {
      const row = await findLoyaltyByCustomerId(sql, customer.id);
      loyalty = row ? loyaltyRowToCard(row, customer.id) : null;
    } catch {
      // Sadakat kartı opsiyonel — login akışını bloklamaz
      loyalty = null;
    }
  }

  return withRealtimeToken(
    loginBodyCore(trace, customer, sessionMeta, existing, loyalty),
    {
      customerId: customer.id,
      isAdmin: Boolean(customer.isAdmin),
      adminVerified: Boolean(existing?.adminVerified)
    }
  );
}

// Giriş — telefon + PIN; normalize tablo üzerinden.
// AKIŞ: Tüm okuma + PIN doğrulama bölümü `resolveLoginOutcome` içinde yapılır ve
// res'e HİÇBİR ŞEY yazmaz; yalnızca bir "sonuç tarifi" döndürür. Bu bölüm
// withSqlRetry ile per-attempt zaman aşımına (attemptTimeoutMs) alınır: bayat
// bağlantıda ilk sorgu ~6sn'de bırakılıp taze bağlantıyla yeniden denenir
// (eski hâlinde ~15sn+ takılıp Android'de "sunucuya ulaşılamadı" oluyordu).
// createSession + res yazımı SADECE retry bittikten sonra TEK sefer yapılır;
// böylece terk edilen bir deneme geç tamamlanıp res'e ikinci kez yazamaz
// ("headers already sent" çift yazım riski tamamen ortadan kalkar).
export async function handleAuthLogin(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const trace = createRequestTrace('auth.customer-login');
  const startedAt = Date.now();

  try {
    // Bağlantıyı login sorgularından ÖNCE tazele — bayat pooler bağlantısında
    // login'in ortasında saniyelerce takılmayı (uzun bekleme) baştan önler.
    await primeSqlConnection().catch(() => {});

    // B-2: Rate-limit kontrolü retry DIŞINDA, istek başına TEK kez yapılır.
    // Aksi halde withSqlRetry her denemede sayacı artırıp tek kullanıcı eylemini
    // birden çok "hit" sayar ve gerçek müşteriyi yanlışlıkla 429'a düşürürdü.
    //
    // B-3: Asıl limit HESAP (telefon) bazlıdır — brute-force tek hesaba karşı
    // sınırlanır. IP bazlı limit ise gevşektir; böylece kafe gibi paylaşımlı bir
    // IP'de farklı müşteriler birbirini kilitlemez (ortak IP'de toplu 429 olmaz).
    const loginPhone = cleanPhone(String(readBody(req).phone || '').trim());
    if (loginPhone.length >= 10
      && await enforceAuthRateLimit(req, 'auth_login', { maxHits: 15, identifier: loginPhone })) {
      return res.status(429).json(trace.failBody(
        'rate_limit',
        'RATE_LIMITED',
        'Çok fazla deneme. Lütfen bir süre sonra tekrar dene.'
      ));
    }
    // Gevşek IP üst sınırı: tek IP'nin çok sayıda farklı hesabı denemesini (credential
    // stuffing) yakalar, normal kafe trafiğini engellemez.
    if (await enforceAuthRateLimit(req, 'auth_login_ip', { maxHits: 80 })) {
      return res.status(429).json(trace.failBody(
        'rate_limit',
        'RATE_LIMITED',
        'Çok fazla deneme. Lütfen bir süre sonra tekrar dene.'
      ));
    }

    const outcome = await withSqlRetry(
      () => resolveLoginOutcome(req, trace),
      { resetClient: resetSqlClient, attemptTimeoutMs: 6000, retries: 2 }
    );

    if (outcome.kind === 'error') {
      return res.status(outcome.status).json(outcome.body);
    }

    // Mevcut geçerli oturum yeniden kullanılıyor — yeni oturum oluşturma.
    // Oturum geçerli olduğu için gövde üretimi başarısız olsa bile 200 dön.
    if (outcome.kind === 'reuse') {
      const reuseMeta = { role: outcome.role, token: outcome.token };
      let bodyOk;
      try {
        bodyOk = await buildLoginSuccessBody(trace, outcome.customer, reuseMeta, outcome.existing);
      } catch (bodyError) {
        console.error('[auth.customer-login]', trace.requestId, 'reuse_body_failed', bodyError?.message || bodyError);
        bodyOk = buildPlainLoginBody(trace, outcome.customer, reuseMeta, outcome.existing);
      }
      trace.log('session_reuse', { customerId: outcome.customer.id, status: 'ok', durationMs: Date.now() - startedAt });
      return res.status(200).json(bodyOk);
    }

    // Başarılı giriş — oturumu burada (retry dışında, tek sefer) oluştur ve yaz
    await indexCustomerEmail(outcome.customer).catch(() => {});

    let session;
    try {
      session = await createSession(res, {
        customerId: outcome.customer.id,
        role: outcome.role,
        deviceId: outcome.deviceId,
        sql: getSql()
      });
    } catch (sessionError) {
      console.error('[auth.customer-login]', trace.requestId, sessionError?.message || sessionError);
      return res.status(500).json(trace.failBody(
        'session_create',
        'SESSION_CREATE_FAILED',
        'Oturum oluşturulamadı. Lütfen tekrar dene.'
      ));
    }
    trace.markStep('session_create');

    trace.log('complete_ok', {
      customerId: outcome.customer.id,
      role: session.role,
      isAdmin: session.isAdmin,
      sessionCreated: true,
      status: 'ok',
      durationMs: Date.now() - startedAt
    });

    // Oturum DURABLE olarak oluşturuldu (cookie + DB satırı yazıldı). Bundan sonra
    // gövde üretimi (sadakat sorgusu / realtime token) BAŞARISIZ olsa bile 500
    // DÖNME — kullanıcı zaten authenticated; aksi halde "login 500 ama profile açık"
    // tutarsızlığı oluşur. Hata olursa minimal başarı gövdesiyle 200 dön.
    let bodyOk;
    try {
      bodyOk = await buildLoginSuccessBody(trace, outcome.customer, session);
    } catch (bodyError) {
      console.error('[auth.customer-login]', trace.requestId, 'success_body_failed', bodyError?.message || bodyError);
      bodyOk = buildPlainLoginBody(trace, outcome.customer, session);
    }
    return res.status(200).json(bodyOk);
  } catch (e) {
    console.error('[auth.customer-login]', trace.requestId, e?.stack || e?.message || e);
    return res.status(500).json(trace.failBody(
      'unexpected',
      publicDbErrorCode(e, 'LOGIN_FAILED'),
      publicDbErrorMessage(e, 'Giriş yapılamadı. Lütfen tekrar dene.')
    ));
  }
}

// Giriş okuma + doğrulama — res'e YAZMAZ, yalnızca sonuç tarifi döndürür.
// Dönüş türleri:
//   { kind: 'error',   status, body }            → hata yanıtı
//   { kind: 'reuse',   customer, role, token, existing } → geçerli oturum tekrar kullanılır
//   { kind: 'success', customer, role, existing, deviceId } → yeni oturum oluşturulacak
async function resolveLoginOutcome(req, trace) {
  const body = readBody(req);
  const rawPhone = String(body.phone || '').trim();
  const phone = cleanPhone(rawPhone);
  const pin = normalizePin(body.pin);
  const deviceId = String(body.deviceId || '').trim();

  trace.markStep('parse_body');

  if (phone.length < 10) {
    return { kind: 'error', status: 400, body: trace.failBody('validate', 'VALIDATION', 'Telefon eksik') };
  }
  if (!process.env.DATABASE_URL) {
    return { kind: 'error', status: 500, body: trace.failBody('database', 'DATABASE_URL', 'Veritabanı yapılandırması eksik') };
  }

  // NOT: Rate-limit kontrolü handleAuthLogin'de retry dışında yapılır (B-2).

  const existing = await getSession(req);
  trace.markStep('session_read');

  const sql = getSql();

  let customer = sessionMatchesPhone(existing, phone) ? existing.customer : null;
  if (!customer && sql) {
    const { findCustomerByPhone: findByPhoneSql } = await import('../customersStore.js');
    customer = await findByPhoneSql(sql, phone);
  } else if (!customer) {
    customer = await findCustomerByPhone(phone);
  }

  const hasPinAuth = sql ? await hasCustomerPinAuth(sql, phone) : false;

  trace.log('lookup', {
    rawPhone,
    normalizedPhone: phone,
    step: 'customer_lookup',
    foundCustomer: Boolean(customer),
    customerId: customer?.id || null,
    hasPinAuth,
    role: customer?.isAdmin ? 'admin' : 'user',
    isAdmin: Boolean(customer?.isAdmin)
  });

  if (!customer) {
    if (hasPinAuth) {
      return { kind: 'error', status: 500, body: trace.failBody(
        'customer_repair',
        'CUSTOMER_REPAIR_FAILED',
        'Hesap kaydı eksik görünüyor. Destek ile iletişime geçin veya PIN sıfırlamayı deneyin.'
      ) };
    }
    return { kind: 'error', status: 404, body: trace.failBody(
      'customer_lookup',
      'CUSTOMER_NOT_FOUND',
      'Bu telefon ile kayıt bulunamadı. Önce kayıt olun.'
    ) };
  }

  const expectedRole = customer.isAdmin ? 'admin' : 'user';
  if (
    existing
    && sessionMatchesPhone(existing, phone)
    && Number(existing.customerId) === Number(customer.id)
    && existing.role === expectedRole
    && readAuthToken(req)
  ) {
    return { kind: 'reuse', customer, role: existing.role, token: readAuthToken(req), existing };
  }

  if (!isValidPinFormat(pin)) {
    return { kind: 'error', status: 400, body: trace.failBody('validate_pin', 'VALIDATION', 'PIN 4 veya 6 haneli olmalı.') };
  }

  if (!sql) {
    return { kind: 'error', status: 500, body: trace.failBody('database', 'DATABASE_URL', 'Veritabanı yapılandırması eksik') };
  }

  trace.markStep('pin_lookup');

  trace.log('pin_check', {
    rawPhone,
    normalizedPhone: phone,
    hasPinAuth,
    customerId: customer.id
  });

  const verified = await verifyCustomerPin(sql, phone, pin);
  trace.markStep('pin_verify');

  trace.log('pin_result', {
    hasPinAuth,
    pinVerifyResult: verified.ok,
    code: verified.code || null,
    customerId: customer.id
  });

  if (!verified.ok) {
    const message = verified.code === 'PIN_INVALID'
      ? 'PIN hatalı.'
      : verified.code === 'PIN_NOT_FOUND'
        ? 'Bu hesap için PIN bulunamadı. PIN sıfırlayın.'
        : (verified.error || 'PIN doğrulanamadı.');
    return { kind: 'error', status: verified.status, body: {
      ok: false,
      requestId: trace.requestId,
      step: 'pin_verify',
      code: verified.code || 'PIN_VERIFY_FAILED',
      error: message,
      message,
      lockedUntil: verified.lockedUntil || null
    } };
  }

  return { kind: 'success', customer, role: expectedRole, existing, deviceId };
}
