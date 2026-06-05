import { loadAppState, saveAppState } from './appState.js';
import { cleanPhone } from './phone.js';
import {
  listCustomers,
  normalizeEmail,
  syncCustomerEmailsFromState
} from './customerEmails.js';
import { getSql } from './appState.js';

// Bilinen telefon → e-posta eşleşmeleri (eksik e-posta alanlarını onar)
const BASELINE_CONTACTS = [
  { phone: '5058665406', email: 'liberteserdivan@gmail.com' },
  { phone: '5550100001', email: 'demo.customer@liberte.cafe' },
  { phone: '5550100002', email: 'demo.admin@liberte.cafe' }
];

// Eksik e-posta alanlarını bilinen kayıtlarla tamamla
export async function repairCustomerDirectory() {
  const remote = await loadAppState();
  if (!remote.data) return false;

  const customers = listCustomers(remote.data);
  let changed = false;

  for (const baseline of BASELINE_CONTACTS) {
    const phone = cleanPhone(baseline.phone);
    const email = normalizeEmail(baseline.email);
    const existing = customers.find((c) => cleanPhone(c.phone) === phone);

    if (existing && !normalizeEmail(existing.email) && email) {
      existing.email = email;
      changed = true;
    }
  }

  if (!changed) return false;

  remote.data.customers = customers;
  await saveAppState(remote.data);
  await syncCustomerEmailsFromState(remote.data);
  return true;
}

// PIN sıfırlama için müşteriyi e-posta veya telefon ile bul
export async function resolveRecoveryCustomer(rawInput) {
  const value = String(rawInput || '').trim();
  if (!value) return { ok: false, status: 400, error: 'E-posta veya telefon gir.' };

  const tryResolve = async () => {
    if (value.includes('@')) {
      const email = normalizeEmail(value);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, status: 400, error: 'Geçerli e-posta gir.' };
      }

      const { data } = await loadAppState();
      if (data) {
        await syncCustomerEmailsFromState(data);
        const fromState = listCustomers(data).find((c) => normalizeEmail(c.email) === email);
        if (fromState) {
          return buildRecoveryResult(fromState, email);
        }
      }

      const sql = getSql();
      if (sql) {
        await sql`CREATE TABLE IF NOT EXISTS customer_emails (
          email text PRIMARY KEY,
          customer_id bigint NOT NULL,
          phone text NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`;
        const rows = await sql`
          SELECT customer_id, phone FROM customer_emails WHERE email = ${email} LIMIT 1
        `;
        if (rows[0] && data) {
          const fromId = listCustomers(data).find(
            (c) => Number(c.id) === Number(rows[0].customer_id)
          );
          if (fromId) return buildRecoveryResult(fromId, email);
        }
      }

      return { ok: false, status: 404, error: 'Bu e-posta ile kayıt bulunamadı.' };
    }

    const phone = cleanPhone(value);
    if (phone.length < 10) {
      return { ok: false, status: 400, error: 'Geçerli e-posta veya 10 haneli telefon gir.' };
    }

    const { data } = await loadAppState();
    const fromPhone = listCustomers(data).find((c) => cleanPhone(c.phone) === phone);
    if (!fromPhone) {
      return { ok: false, status: 404, error: 'Bu telefon ile kayıt bulunamadı.' };
    }

    const deliveryEmail = normalizeEmail(fromPhone.email);
    if (!deliveryEmail) {
      return {
        ok: false,
        status: 400,
        error: 'Hesabında kayıtlı e-posta yok. Destek ile iletişime geç.'
      };
    }

    return buildRecoveryResult(fromPhone, deliveryEmail);
  };

  let result = await tryResolve();
  if (result.ok) return result;

  const repaired = await repairCustomerDirectory();
  if (!repaired) return result;

  result = await tryResolve();
  return result;
}

// Müşteri ve kod gönderilecek e-postayı hazırla
function buildRecoveryResult(customer, deliveryEmail) {
  const phone = cleanPhone(customer.phone);
  if (phone.length < 10) {
    return { ok: false, status: 400, error: 'Hesapta geçerli telefon yok. Destek ile iletişime geç.' };
  }

  return {
    ok: true,
    customer,
    deliveryEmail,
    phone
  };
}
