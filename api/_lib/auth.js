import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cleanPhone } from './phone.js';
import { loadAppState, getSql } from './appState.js';
import { useRelationalState } from './relationalConfig.js';
import { ensureSchemaReady } from './schemaReady.js';
import { runSql, runSqlRead, runSqlReadFast } from './runSql.js';
import {
  findCustomerIdByEmail,
  listCustomers,
  normalizeEmail,
  syncCustomerEmailsFromState,
  upsertCustomerEmail
} from './customerEmails.js';
import { generateUniqueReferralCode } from './referralCode.js';
import { purgeExpiredAuthData } from './maintenance.js';

export const SESSION_COOKIE = 'liberte_session';
const SESSION_DAYS = 30;

// Token hash üret
function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// Oturum tablosunu hazırla
async function ensureSessionTable(sql) {
  await ensureSchemaReady(sql);
}

// API yanıtı için müşteri özeti
export function toCustomerSnapshot(customer) {
  if (!customer) return null;
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    isAdmin: Boolean(customer.isAdmin),
    birthDate: customer.birthDate || '',
    referralCode: customer.referralCode || null
  };
}

// Cookie'den veya Authorization başlığından token oku
export function readAuthToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  const cookie = req.headers.cookie || '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

// B-14: Çerez Secure bayrağı — Vercel'de VERCEL_ENV daha güvenilir. production
// veya preview ortamında Secure açık; yalnızca yerel geliştirmede kapalı.
function isSecureCookieEnv() {
  return process.env.NODE_ENV === 'production'
    || process.env.VERCEL_ENV === 'production'
    || process.env.VERCEL_ENV === 'preview';
}

// Oturum çerezini ayarla
export function setSessionCookie(res, token) {
  const secure = isSecureCookieEnv() ? '; Secure' : '';
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

// Oturum çerezini temizle
export function clearSessionCookie(res) {
  const secure = isSecureCookieEnv() ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

// Aktif oturumu veritabanından getir
export async function getSession(req) {
  const token = readAuthToken(req);
  if (!token) return null;

  // Oturum okuma fail-fast — bayat bağlantıda kısa timeout + az deneme.
  // (Rol değişiminde yapılan tek UPDATE idempotenttir; sınırlı retry güvenlidir.)
  return runSqlReadFast(async () => {
    const sql = getSql();
    if (!sql) return null;

    await ensureSessionTable(sql);
    const tokenHash = hashToken(token);
    const rows = await sql`
      SELECT customer_id, role, admin_verified, expires_at
      FROM auth_sessions
      WHERE token_hash = ${tokenHash}
        AND expires_at > now()
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return null;

    const session = {
      customerId: Number(row.customer_id),
      role: row.role,
      isAdmin: row.role === 'admin',
      adminVerified: Boolean(row.admin_verified),
      expiresAt: row.expires_at
    };

    return syncSessionWithCustomer(req, session);
  });
}

// QR üretimi için hafif oturum — müşteri sync ve invalidate yok
export async function getSessionForQr(req) {
  const token = readAuthToken(req);
  if (!token) return null;

  // Salt-okunur — bayat bağlantıda fail-fast (kısa timeout + az deneme).
  return runSqlReadFast(async () => {
    const sql = getSql();
    if (!sql) return null;

    await ensureSessionTable(sql);
    const rows = await sql`
      SELECT customer_id, role, admin_verified
      FROM auth_sessions
      WHERE token_hash = ${hashToken(token)}
        AND expires_at > now()
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return null;

    return {
      customerId: Number(row.customer_id),
      role: row.role,
      isAdmin: row.role === 'admin',
      adminVerified: Boolean(row.admin_verified)
    };
  });
}

// Oturum bootstrap — tek SQL turunda oturum + müşteri
export async function getSessionForBootstrap(req) {
  const token = readAuthToken(req);
  if (!token) return null;

  // Salt-okunur bootstrap — fail-fast (kısa timeout + az deneme); böylece
  // realtime/state/push gibi oturum bağımlı uçlar 30-120sn asılı kalmaz ve
  // yetkisiz/expired token'da hızlı 401 döner.
  return runSqlReadFast(async () => {
    const sql = getSql();
    if (!sql) return null;

    await ensureSessionTable(sql);
    const rows = await sql`
      SELECT customer_id, role, admin_verified
      FROM auth_sessions
      WHERE token_hash = ${hashToken(token)}
        AND expires_at > now()
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return null;

    const identity = {
      customerId: Number(row.customer_id),
      role: row.role,
      isAdmin: row.role === 'admin',
      adminVerified: Boolean(row.admin_verified)
    };

    const {
      findCustomerById,
      findLoyaltyByCustomerId,
      loyaltyRowToCard
    } = await import('./customersStore.js');
    const customer = await findCustomerById(sql, identity.customerId);
    let loyalty = null;
    if (customer) {
      const loyaltyRow = await findLoyaltyByCustomerId(sql, identity.customerId);
      loyalty = loyaltyRowToCard(loyaltyRow, identity.customerId);
    }

    return {
      ...identity,
      customer: customer ? toCustomerSnapshot(customer) : null,
      loyalty
    };
  });
}

// Oturumu veritabanından sil — yanıt gövdesi yazmadan
export async function invalidateCurrentSession(req) {
  const token = readAuthToken(req);
  if (!token) return;

  await runSql(async () => {
    const sql = getSql();
    if (!sql) return;

    await ensureSessionTable(sql);
    await sql`DELETE FROM auth_sessions WHERE token_hash = ${hashToken(token)}`;
  });
}

// Oturum satırını veritabanında güncelle
async function persistSessionRole(token, { role, adminVerified }) {
  const sql = getSql();
  if (!sql || !token) return;

  await ensureSessionTable(sql);
  await sql`
    UPDATE auth_sessions
    SET role = ${role},
        admin_verified = ${Boolean(adminVerified)}
    WHERE token_hash = ${hashToken(token)}
      AND expires_at > now()
  `;
}

// Oturumu canlı kayıtla doğrula — önce normalize tablo, gerekirse legacy app_state
export async function syncSessionWithCustomer(req, session) {
  if (!session) return null;

  const sql = getSql();
  let customer = null;
  let loyalty = null;

  if (sql) {
    const {
      findCustomerById,
      findLoyaltyByCustomerId,
      loyaltyRowToCard
    } = await import('./customersStore.js');
    customer = await findCustomerById(sql, session.customerId);
    if (customer) {
      const row = await findLoyaltyByCustomerId(sql, session.customerId);
      loyalty = loyaltyRowToCard(row, session.customerId);
    }
  }

  if (!customer) {
    if (useRelationalState()) {
      await invalidateCurrentSession(req);
      return null;
    }

    const { data } = await loadAppState({ skipPersist: true, skipCache: true });
    customer = listCustomers(data).find(
      (row) => Number(row.id) === Number(session.customerId)
    );
    if (customer) {
      loyalty = data?.loyalty?.[customer.id]
        || data?.loyalty?.[String(customer.id)]
        || null;
    }
  }

  if (!customer) {
    await invalidateCurrentSession(req);
    return null;
  }

  const liveRole = customer.isAdmin ? 'admin' : 'user';
  const needsUpdate = liveRole !== session.role
    || (session.isAdmin && !customer.isAdmin)
    || (session.adminVerified && liveRole !== 'admin');

  if (needsUpdate) {
    const token = readAuthToken(req);
    const nextVerified = liveRole === 'admin' ? session.adminVerified : false;
    await persistSessionRole(token, { role: liveRole, adminVerified: nextVerified });
    session.role = liveRole;
    session.isAdmin = liveRole === 'admin';
    session.adminVerified = nextVerified;
  }

  session.customer = toCustomerSnapshot(customer);
  session.loyalty = loyalty;

  return session;
}

// Yeni oturum oluştur
export async function createSession(res, { customerId, role = 'user', deviceId = '', sql: externalSql = null }) {
  return runSql(async () => {
    const sql = externalSql || getSql();
    if (!sql) throw new Error('DATABASE_URL eksik');

    await ensureSessionTable(sql);
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const safeRole = role === 'admin' ? 'admin' : 'user';

    await sql`
      INSERT INTO auth_sessions (token_hash, customer_id, role, device_id, expires_at)
      VALUES (
        ${tokenHash},
        ${customerId},
        ${safeRole},
        ${deviceId || null},
        now() + interval '30 days'
      )
    `;

    setSessionCookie(res, token);
    return { token, customerId, role: safeRole, isAdmin: safeRole === 'admin' };
  });
}

// Oturumu sonlandır
export async function destroySession(req, res) {
  const token = readAuthToken(req);
  if (token) {
    await runSql(async () => {
      const sql = getSql();
      if (!sql) return;

      await ensureSessionTable(sql);
      await sql`DELETE FROM auth_sessions WHERE token_hash = ${hashToken(token)}`;

      // B-9: Cron olmadığından, düşük frekanslı bu yazma yolunda DÜŞÜK OLASILIKLA
      // süresi dolan kayıtları temizle (best-effort; logout'u yavaşlatmasın).
      if (Math.random() < 0.05) {
        try {
          await purgeExpiredAuthData(sql);
        } catch (purgeError) {
          console.warn('[auth.purge]', purgeError?.message || purgeError);
        }
      }
    });
  }
  clearSessionCookie(res);
}

// B-10: Bir müşterinin TÜM oturumlarını iptal et (PIN sıfırlama/değişimi sonrası).
// Çalınan veya eski token'lar (30 gün geçerli) PIN değişince geçersiz kalsın.
export async function invalidateSessionsForCustomer(sql, customerId) {
  if (!sql || !customerId) return;
  await ensureSessionTable(sql);
  await sql`DELETE FROM auth_sessions WHERE customer_id = ${Number(customerId)}`;
}

// Admin PIN doğrula
export function verifyAdminPin(pin) {
  const expected = String(process.env.ADMIN_PIN || process.env.CASHIER_PIN || '').trim();
  if (!expected) return false;

  const a = Buffer.from(String(pin || '').trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Oturumda admin PIN onayını işaretle — rol ve is_admin birlikte güncellenir
export async function markAdminVerified(req) {
  const token = readAuthToken(req);
  if (!token) return false;

  return runSql(async () => {
    const sql = getSql();
    if (!sql) return false;

    await ensureSessionTable(sql);
    const rows = await sql`
      UPDATE auth_sessions AS s
      SET admin_verified = true,
          role = 'admin'
      FROM customers AS c
      WHERE s.token_hash = ${hashToken(token)}
        AND s.expires_at > now()
        AND c.id = s.customer_id
        AND c.is_admin = true
      RETURNING s.customer_id
    `;
    return Boolean(rows[0]);
  });
}

// Müşteriyi telefon ile bul — normalize tablo + yarım kayıt onarımı
export async function findCustomerByPhone(phone) {
  const normalized = cleanPhone(phone);
  const sql = getSql();

  if (sql) {
    const fromSql = await runSql(async () => {
      const { findCustomerByPhone: findByPhoneSql } = await import('./customersStore.js');
      const found = await findByPhoneSql(sql, phone);
      if (found) return found;

      const { repairIncompleteCustomer } = await import('./customerPhoneRepair.js');
      return repairIncompleteCustomer(sql, phone);
    });
    if (fromSql) return fromSql;
  }

  if (useRelationalState()) return null;

  const { data } = await loadAppState({ skipPersist: true, skipCache: true });
  if (!data) return null;
  return listCustomers(data).find((c) => cleanPhone(c.phone) === normalized) || null;
}

// Müşteriyi e-posta ile bul — önce normalize tablo
export async function findCustomerByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const sql = getSql();
  if (sql) {
    const { findCustomerByEmail: findByEmailSql } = await import('./customersStore.js');
    const fromSql = await findByEmailSql(sql, normalized);
    if (fromSql) return fromSql;
  }

  if (useRelationalState()) {
    const indexed = await findCustomerIdByEmail(normalized);
    if (!indexed) return null;
    return {
      id: indexed.customer_id,
      phone: indexed.phone,
      email: normalized,
      name: 'Liberte Üye',
      isAdmin: false
    };
  }

  const { data } = await loadAppState({ skipPersist: true, skipCache: true });
  if (data) {
    await syncCustomerEmailsFromState(data);
    const fromState = listCustomers(data).find((c) => normalizeEmail(c.email) === normalized);
    if (fromState) return fromState;
  }

  const indexed = await findCustomerIdByEmail(normalized);
  if (!indexed) return null;

  const customers = listCustomers(data);
  const fromId = customers.find((c) => Number(c.id) === Number(indexed.customer_id));
  if (fromId) return fromId;

  return {
    id: indexed.customer_id,
    phone: indexed.phone,
    email: normalized,
    name: 'Liberte Üye',
    isAdmin: false
  };
}

// Giriş/kayıt sonrası e-posta indeksini güncelle
export async function indexCustomerEmail(customer) {
  const sql = getSql();
  if (!sql || !customer) return;
  await upsertCustomerEmail(sql, {
    email: customer.email,
    customerId: customer.id,
    phone: customer.phone
  });
}

// Müşteri kaydını sunucu tarafında oluştur
export function buildCustomerRecord(payload, existingCustomers = []) {
  const id = Date.now();
  return {
    id,
    phone: cleanPhone(payload.phone),
    name: String(payload.name || 'Liberte Üye').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    isAdmin: Boolean(payload.isAdmin),
    createdAt: new Date().toLocaleString('tr-TR'),
    lastVisit: new Date().toISOString(),
    birthDate: String(payload.birthDate || ''),
    referralCode: generateUniqueReferralCode(existingCustomers),
    referredBy: payload.referredBy || null
  };
}

// Oturum zorunlu — yoksa 401
export async function requireSession(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Oturum gerekli' });
    return null;
  }
  return session;
}

// Admin oturumu zorunlu — light: push gibi hızlı uçlar için müşteri sync atlanır
export async function requireAdminSession(req, res, { pinRequired = true, light = false } = {}) {
  if (light) {
    const identity = await getSessionForQr(req);
    if (!identity) {
      res.status(401).json({ error: 'Oturum gerekli' });
      return null;
    }
    if (pinRequired && !identity.adminVerified) {
      res.status(403).json({ error: 'Yönetici PIN doğrulaması gerekli', needsAdminPin: true });
      return null;
    }

    const sql = getSql();
    if (sql) {
      const { findCustomerById } = await import('./customersStore.js');
      // Bayat bağlantıda admin doğrulaması fail-fast olsun (admin-members 19sn'lik
      // okuma yığınını kısar; guardian/health 90sn beklemesin)
      const live = await runSqlReadFast(() => findCustomerById(sql, identity.customerId));
      if (!live?.isAdmin) {
        res.status(403).json({ error: 'Yönetici yetkisi gerekli' });
        return null;
      }
    } else if (!identity.isAdmin) {
      res.status(403).json({ error: 'Yönetici yetkisi gerekli' });
      return null;
    }

    return {
      customerId: identity.customerId,
      isAdmin: true,
      adminVerified: identity.adminVerified,
      role: 'admin'
    };
  }

  const session = await requireSession(req, res);
  if (!session) return null;
  if (!session.isAdmin) {
    res.status(403).json({ error: 'Yönetici yetkisi gerekli' });
    return null;
  }
  if (pinRequired && !session.adminVerified) {
    res.status(403).json({ error: 'Yönetici PIN doğrulaması gerekli', needsAdminPin: true });
    return null;
  }
  return session;
}
