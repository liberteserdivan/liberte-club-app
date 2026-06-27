import { getSql } from './appState.js';
import { cleanPhone, phoneLookupVariants } from './phone.js';
import { normalizeEmail } from './customerEmails.js';
import { ensurePinTable } from './pinAuth.js';
import { inList } from './sqlIn.js';

// Müşteri PIN kaydını sil
async function deleteCustomerPin(sql, phone) {
  if (!phone) return;
  await ensurePinTable(sql);
  await sql`DELETE FROM customer_pin_auth WHERE phone = ${cleanPhone(phone)}`;
}

// Müşteri oturumlarını sil
async function deleteCustomerSessions(sql, customerId) {
  await sql`DELETE FROM auth_sessions WHERE customer_id = ${Number(customerId)}`;
}

// E-posta indeksinden müşteriyi sil
async function deleteCustomerEmailIndex(sql, email, customerId) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;

  await sql`
    DELETE FROM customer_emails
    WHERE customer_id = ${Number(customerId)}
       OR email = ${normalized}
  `;
}

// Hesap silme sonrası kimlik kalıntılarını temizle (legacy app_state yolu)
export async function purgeCustomerAuthRecords({ customerId, phone, email }) {
  const sql = getSql();
  if (!sql) return;

  await deleteCustomerPin(sql, phone);
  await deleteCustomerSessions(sql, customerId);
  await deleteCustomerEmailIndex(sql, email, customerId);
}

// Relational modda müşteriyi tüm tablolardan gerçekten sil — tek transaction.
// customers satırı silinince ON DELETE CASCADE ile bağlı tablolar (customer_loyalty,
// loyalty_events, push_subscriptions, check_ins, daily_claims, wheel_spins,
// first_order_bonuses, google_review_requests, customer_notes, in_app_notifications)
// otomatik temizlenir. FK'siz tablolar (auth_sessions, customer_pin_auth,
// customer_emails) ise elle silinir.
export async function purgeCustomerRelational({ customerId, phone, email }, externalSql = null) {
  const sql = externalSql || getSql();
  if (!sql) return false;

  const id = Number(customerId);
  if (!id) return false;

  const variants = phoneLookupVariants(phone);
  const normalizedEmail = normalizeEmail(email);

  // Tüm silmeler tek transaction'da — kısmi silinmiş "yetim" kayıt kalmasın
  await sql.begin(async (tx) => {
    // Oturumlar (FK yok)
    await tx`DELETE FROM auth_sessions WHERE customer_id = ${id}`;
    // PIN kaydı (phone PK, FK yok)
    await tx`DELETE FROM customer_pin_auth WHERE phone IN ${inList(tx, variants)}`;
    // E-posta indeksi (FK yok) — hem id hem normalize e-posta ile
    await tx`DELETE FROM customer_emails WHERE customer_id = ${id}`;
    if (normalizedEmail) {
      await tx`DELETE FROM customer_emails WHERE email = ${normalizedEmail}`;
    }
    // Müşteri satırı — CASCADE bağlı tüm sadakat/etkinlik/push kayıtlarını siler
    await tx`DELETE FROM customers WHERE id = ${id}`;
  });

  return true;
}
