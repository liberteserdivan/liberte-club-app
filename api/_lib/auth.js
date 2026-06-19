import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cleanPhone } from './phone.js';
import { loadAppState, getSql } from './appState.js';
import { ensureSchemaReady } from './schemaReady.js';
import {
  findCustomerIdByEmail,
  listCustomers,
  normalizeEmail,
  syncCustomerEmailsFromState,
  upsertCustomerEmail
} from './customerEmails.js';
import { generateUniqueReferralCode } from './referralCode.js';

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

// Oturum çerezini ayarla
export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

// Oturum çerezini temizle
export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

// Aktif oturumu veritabanından getir
export async function getSession(req) {
  const token = readAuthToken(req);
  if (!token) return null;

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
}

// Oturumu veritabanından sil — yanıt gövdesi yazmadan
export async function invalidateCurrentSession(req) {
  const token = readAuthToken(req);
  if (!token) return;

  const sql = getSql();
  if (!sql) return;

  await ensureSessionTable(sql);
  await sql`DELETE FROM auth_sessions WHERE token_hash = ${hashToken(token)}`;
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

// Oturumu canlı kayıtla doğrula — rol düşürüldüyse admin yetkisini kapat
export async function syncSessionWithCustomer(req, session) {
  if (!session) return null;

  const { data } = await loadAppState();
  const customer = listCustomers(data).find(
    (row) => Number(row.id) === Number(session.customerId)
  );

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
  session.loyalty = data?.loyalty?.[customer.id]
    || data?.loyalty?.[String(customer.id)]
    || null;

  return session;
}

// Yeni oturum oluştur
export async function createSession(res, { customerId, role = 'user', deviceId = '', sql: externalSql = null }) {
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
}

// Oturumu sonlandır
export async function destroySession(req, res) {
  const token = readAuthToken(req);
  if (token) {
    const sql = getSql();
    if (sql) {
      await ensureSessionTable(sql);
      await sql`DELETE FROM auth_sessions WHERE token_hash = ${hashToken(token)}`;
    }
  }
  clearSessionCookie(res);
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

// Oturumda admin PIN onayını işaretle
export async function markAdminVerified(req) {
  const token = readAuthToken(req);
  if (!token) return false;

  const sql = getSql();
  if (!sql) return false;

  await ensureSessionTable(sql);
  await sql`
    UPDATE auth_sessions
    SET admin_verified = true
    WHERE token_hash = ${hashToken(token)}
      AND role = 'admin'
      AND expires_at > now()
  `;
  return true;
}

// Müşteriyi telefon ile bul
export async function findCustomerByPhone(phone) {
  const { data } = await loadAppState();
  if (!data) return null;
  const normalized = cleanPhone(phone);
  return listCustomers(data).find((c) => cleanPhone(c.phone) === normalized) || null;
}

// Müşteriyi e-posta ile bul — app_state + SQL indeks
export async function findCustomerByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const { data } = await loadAppState();
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

// Admin oturumu zorunlu
export async function requireAdminSession(req, res, { pinRequired = true } = {}) {
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
