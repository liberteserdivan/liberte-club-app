import { getSql } from './appState.js';
import { cleanPhone } from './phone.js';
import { normalizeEmail } from './customerEmails.js';
import { ensurePinTable } from './pinAuth.js';

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

// Hesap silme sonrası kimlik kalıntılarını temizle
export async function purgeCustomerAuthRecords({ customerId, phone, email }) {
  const sql = getSql();
  if (!sql) return;

  await deleteCustomerPin(sql, phone);
  await deleteCustomerSessions(sql, customerId);
  await deleteCustomerEmailIndex(sql, email, customerId);
}
