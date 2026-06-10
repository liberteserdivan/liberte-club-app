import { loadAppState, saveAppState } from './appState.js';
import { cleanPhone } from './phone.js';
import {
  findCustomerIdByEmail,
  listCustomers,
  normalizeEmail,
  syncCustomerEmailsFromState
} from './customerEmails.js';

// Bilinen telefon → kimlik eşleşmeleri (eksik alanları ve yönetici yetkisini onar)
const BASELINE_CONTACTS = [
  { id: 1, phone: '5058665406', email: 'liberteserdivan@gmail.com', name: 'Liberte Gastro', isAdmin: true },
  { id: 900001, phone: '5550100001', email: 'demo.customer@liberte.cafe', name: 'Demo Müşteri', isAdmin: false },
  { id: 900002, phone: '5550100002', email: 'demo.admin@liberte.cafe', name: 'Demo Yönetici', isAdmin: true }
];

// Yeni müşteri için sadakat kaydı şablonu
function loyaltyTemplate(id) {
  return {
    customerId: id,
    totalStamps: 0,
    categoryStamps: { coffee: 0, dessert: 0, burger: 0 },
    categoryRewards: { coffee: 0, dessert: 0, burger: 0 },
    availableRewards: 0,
    usedRewards: 0,
    lifetimeStamps: 0,
    level: 'Bronze'
  };
}

// Silinmiş bilinen hesabı yeniden oluştur
function recreateBaselineCustomer(baseline) {
  return {
    id: baseline.id,
    phone: cleanPhone(baseline.phone),
    name: baseline.name,
    email: normalizeEmail(baseline.email),
    isAdmin: Boolean(baseline.isAdmin),
    createdAt: new Date().toLocaleString('tr-TR'),
    lastVisit: null,
    birthDate: ''
  };
}

// Eksik e-posta / yönetici yetkisini onar; silinmiş bilinen hesapları geri ekle
export async function repairCustomerDirectory() {
  const remote = await loadAppState();
  if (!remote.data) return false;

  const customers = listCustomers(remote.data);
  const loyalty = remote.data.loyalty || {};
  let changed = false;

  for (const baseline of BASELINE_CONTACTS) {
    const phone = cleanPhone(baseline.phone);
    const email = normalizeEmail(baseline.email);
    const existing = customers.find((c) => cleanPhone(c.phone) === phone);

    if (!existing) {
      // Bilinen hesap silinmişse yeniden oluştur
      const restored = recreateBaselineCustomer(baseline);
      customers.push(restored);
      if (!loyalty[restored.id]) loyalty[restored.id] = loyaltyTemplate(restored.id);
      changed = true;
      continue;
    }

    // Eksik e-postayı tamamla
    if (!normalizeEmail(existing.email) && email) {
      existing.email = email;
      changed = true;
    }

    // Yönetici yetkisi düşmüşse geri ver
    if (baseline.isAdmin && !existing.isAdmin) {
      existing.isAdmin = true;
      changed = true;
    }
  }

  if (!changed) return false;

  remote.data.customers = customers;
  remote.data.loyalty = loyalty;
  await saveAppState(remote.data);
  await syncCustomerEmailsFromState(remote.data);
  return true;
}

// Bilinen e-posta → telefon eşleşmesi ile müşteri bul
function findByBaselineEmail(data, email) {
  const normalized = normalizeEmail(email);
  const baseline = BASELINE_CONTACTS.find((item) => normalizeEmail(item.email) === normalized);
  if (!baseline || !data) return null;

  return listCustomers(data).find(
    (customer) => cleanPhone(customer.phone) === cleanPhone(baseline.phone)
  ) || null;
}

// E-posta ile müşteri ara — state, indeks ve bilinen eşleşmeler
async function findCustomerByEmailDeep(email) {
  const normalized = normalizeEmail(email);
  const { data } = await loadAppState();

  if (data) {
    const fromState = listCustomers(data).find((c) => normalizeEmail(c.email) === normalized);
    if (fromState) return { customer: fromState, deliveryEmail: normalized };

    const fromBaseline = findByBaselineEmail(data, normalized);
    if (fromBaseline) {
      const deliveryEmail = normalizeEmail(fromBaseline.email) || normalized;
      return { customer: fromBaseline, deliveryEmail };
    }
  }

  const indexed = await findCustomerIdByEmail(normalized);
  if (indexed && data) {
    const fromId = listCustomers(data).find(
      (c) => Number(c.id) === Number(indexed.customer_id)
    );
    if (fromId) {
      return { customer: fromId, deliveryEmail: normalized };
    }
  }

  return null;
}

// Telefon ile müşteri ara — kodlar kayıtlı e-postaya gider
async function findCustomerByPhoneDeep(phone) {
  const normalizedPhone = cleanPhone(phone);
  const { data } = await loadAppState();
  const fromPhone = listCustomers(data).find((c) => cleanPhone(c.phone) === normalizedPhone);

  if (!fromPhone) return null;

  let deliveryEmail = normalizeEmail(fromPhone.email);
  if (!deliveryEmail) {
    const baseline = BASELINE_CONTACTS.find(
      (item) => cleanPhone(item.phone) === normalizedPhone
    );
    deliveryEmail = normalizeEmail(baseline?.email || '');
  }

  if (!deliveryEmail) {
    return { error: 'Hesabında kayıtlı e-posta yok. Destek ile iletişime geç.' };
  }

  return { customer: fromPhone, deliveryEmail };
}

// PIN sıfırlama — e-posta veya telefon ile müşteri bul
export async function resolveRecoveryCustomer(rawInput) {
  const value = String(rawInput || '').trim();
  if (!value) return { ok: false, status: 400, error: 'E-posta veya telefon gir.' };

  try {
    await repairCustomerDirectory();
  } catch {
    // Onarım başarısız olsa da aramaya devam et
  }

  if (value.includes('@')) {
    const email = normalizeEmail(value);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, status: 400, error: 'Geçerli e-posta gir.' };
    }

    const found = await findCustomerByEmailDeep(email);
    if (!found) {
      return { ok: false, status: 404, error: 'Bu e-posta ile kayıt bulunamadı.' };
    }

    return buildRecoveryResult(found.customer, found.deliveryEmail);
  }

  const phone = cleanPhone(value);
  if (phone.length < 10) {
    return { ok: false, status: 400, error: 'Geçerli e-posta veya 10 haneli telefon gir.' };
  }

  const found = await findCustomerByPhoneDeep(phone);
  if (!found) {
    return { ok: false, status: 404, error: 'Bu telefon ile kayıt bulunamadı.' };
  }
  if (found.error) {
    return { ok: false, status: 400, error: found.error };
  }

  return buildRecoveryResult(found.customer, found.deliveryEmail);
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
