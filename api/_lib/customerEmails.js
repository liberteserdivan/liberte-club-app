import { getSql } from './appState.js';
import { cleanPhone, phoneLookupVariants } from './phone.js';
import { ensureSchemaReady } from './schemaReady.js';

// E-posta karşılaştırması için normalize et
export function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

// app_state içindeki müşteri listesini diziye çevir
export function listCustomers(data) {
  const raw = data?.customers;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return Object.values(raw);
  return [];
}

// E-posta indeks tablosunu hazırla
export async function ensureCustomerEmailTable(sql) {
  await ensureSchemaReady(sql);
}

// Tek müşteri e-postasını indekse yaz
export async function upsertCustomerEmail(sql, { email, customerId, phone }) {
  const normalized = normalizeEmail(email);
  const normalizedPhone = cleanPhone(phone);
  if (!normalized || normalizedPhone.length < 10 || !customerId) return;

  await ensureCustomerEmailTable(sql);
  await sql`
    INSERT INTO customer_emails (email, customer_id, phone, updated_at)
    VALUES (${normalized}, ${customerId}, ${normalizedPhone}, now())
    ON CONFLICT (email) DO UPDATE SET
      customer_id = EXCLUDED.customer_id,
      phone = EXCLUDED.phone,
      updated_at = now()
  `;
}

// app_state müşterilerini e-posta indeksine senkronize et
export async function syncCustomerEmailsFromState(state) {
  const sql = getSql();
  if (!sql || !state) return;

  await ensureCustomerEmailTable(sql);
  for (const customer of listCustomers(state)) {
    await upsertCustomerEmail(sql, {
      email: customer.email,
      customerId: customer.id,
      phone: customer.phone
    });
  }
}

// İndeksten telefon ile müşteri kimliğini bul
export async function findCustomerIdByPhone(sql, phone) {
  const normalizedPhone = cleanPhone(phone);
  if (!sql || normalizedPhone.length < 10) return null;

  await ensureCustomerEmailTable(sql);
  const variants = phoneLookupVariants(phone);
  const rows = await sql`
    SELECT customer_id, email, phone
    FROM customer_emails
    WHERE phone = ANY(${variants})
       OR phone = ${normalizedPhone}
    LIMIT 1
  `;

  return rows[0] || null;
}

// PIN kaydı var mı — tamamlanmış kayıt kontrolü
export async function hasCustomerPinAuth(sql, phone) {
  const normalizedPhone = cleanPhone(phone);
  if (!sql || normalizedPhone.length < 10) return false;

  const variants = phoneLookupVariants(phone);
  const rows = await sql`
    SELECT phone FROM customer_pin_auth WHERE phone = ANY(${variants}) LIMIT 1
  `;
  return rows.length > 0;
}

// İndeksten müşteri kimliğini bul
export async function findCustomerIdByEmail(email) {
  const sql = getSql();
  const normalized = normalizeEmail(email);
  if (!sql || !normalized) return null;

  await ensureCustomerEmailTable(sql);
  const rows = await sql`
    SELECT customer_id, phone
    FROM customer_emails
    WHERE email = ${normalized}
    LIMIT 1
  `;

  return rows[0] || null;
}
