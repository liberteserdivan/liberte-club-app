import { parseAppStateData } from './appState.js';
import { cleanPhone, phoneLookupVariants } from './phone.js';
import { listCustomers, normalizeEmail, findCustomerIdByPhone, findCustomerIdByEmail, hasCustomerPinAuth } from './customerEmails.js';

const STATE_ID = 'liberte';

// app_state içinden müşteri kaydını oku
async function fetchAppStateCustomer(sql, customerId) {
  const rows = await sql`
    SELECT data FROM app_state WHERE id = ${STATE_ID} LIMIT 1
  `;
  const data = parseAppStateData(rows[0]?.data);
  if (!data) return null;

  const customers = listCustomers(data);
  return customers.find((c) => Number(c.id) === Number(customerId)) || null;
}

// app_state içinden sadakat kartını oku
async function fetchAppStateLoyalty(sql, customerId) {
  const rows = await sql`
    SELECT data FROM app_state WHERE id = ${STATE_ID} LIMIT 1
  `;
  const data = parseAppStateData(rows[0]?.data);
  if (!data?.loyalty) return null;

  const loyalty = data.loyalty[customerId] || data.loyalty[String(customerId)];
  return loyalty || null;
}

// PIN tablosundan müşteri kimliğini al
async function fetchPinAuthCustomerId(sql, phone) {
  const variants = phoneLookupVariants(phone);
  const rows = await sql`
    SELECT customer_id, phone
    FROM customer_pin_auth
    WHERE phone = ANY(${variants})
    LIMIT 1
  `;
  return rows[0] ? Number(rows[0].customer_id) : null;
}

// customers satırı var mı — onarım yapmadan
async function hasCustomerRow(sql, customerId) {
  const rows = await sql`
    SELECT id FROM customers WHERE id = ${Number(customerId)} LIMIT 1
  `;
  return rows.length > 0;
}

// İndeks + app_state verisinden eksik müşteri satırını oluştur
export async function repairIncompleteCustomer(sql, phone) {
  const normalized = cleanPhone(phone);
  if (!sql || normalized.length < 10) return null;

  const {
    ensureCustomersTables,
    customerRowToRecord,
    upsertCustomerRow,
    upsertLoyaltyRow,
    buildWelcomeLoyalty,
    findLoyaltyByCustomerId
  } = await import('./customersStore.js');

  await ensureCustomersTables(sql);

  const indexed = await findCustomerIdByPhone(sql, phone);
  const pinCustomerId = await fetchPinAuthCustomerId(sql, phone);
  const customerId = indexed?.customer_id || pinCustomerId;
  if (!customerId) return null;

  if (await hasCustomerRow(sql, customerId)) {
    return null;
  }

  const fromState = await fetchAppStateCustomer(sql, customerId);
  const email = normalizeEmail(fromState?.email || indexed?.email || '');
  const name = String(fromState?.name || 'Liberte Üye').trim();

  const customer = {
    id: Number(customerId),
    phone: normalized,
    name,
    email,
    birthDate: fromState?.birthDate || '',
    referralCode: fromState?.referralCode || null,
    isAdmin: Boolean(fromState?.isAdmin),
    referredBy: fromState?.referredBy || null,
    createdAt: fromState?.createdAt || new Date().toLocaleString('tr-TR'),
    lastVisit: fromState?.lastVisit || new Date().toISOString()
  };

  await upsertCustomerRow(sql, customer);

  const existingLoyalty = await findLoyaltyByCustomerId(sql, customerId);
  if (!existingLoyalty) {
    const { migrateLoyaltyCard } = await import('./loyaltyPointsServer.js');
    const fromStateLoyalty = await fetchAppStateLoyalty(sql, customerId);
    const card = fromStateLoyalty
      ? migrateLoyaltyCard(fromStateLoyalty)
      : buildWelcomeLoyalty(customerId);
    await upsertLoyaltyRow(sql, customerId, card);
  }

  console.info('[customer.repair]', JSON.stringify({
    customerId,
    normalizedPhone: normalized,
    source: fromState ? 'app_state' : 'index',
    email: email ? `${email.slice(0, 2)}***` : null
  }));

  return customerRowToRecord({ ...customer, normalized_phone: normalized });
}

// Kayıt çakışması analizi — duplicate kaynağını netleştir
export async function inspectRegistrationConflict(sql, phone, email) {
  const normalizedPhone = cleanPhone(phone);
  const normalizedEmail = normalizeEmail(email);
  const variants = phoneLookupVariants(phone);

  const { ensureCustomersTables } = await import('./customersStore.js');
  await ensureCustomersTables(sql);

  const phoneRows = await sql`
    SELECT id, phone, normalized_phone, email
    FROM customers
    WHERE normalized_phone = ${normalizedPhone}
       OR phone = ANY(${variants})
    LIMIT 1
  `;
  const emailRows = normalizedEmail
    ? await sql`
        SELECT id, phone, email
        FROM customers
        WHERE lower(email) = ${normalizedEmail}
        LIMIT 1
      `
    : [];

  const indexedPhone = await findCustomerIdByPhone(sql, phone);
  const indexedEmail = await findCustomerIdByEmail(normalizedEmail);
  const hasPin = await hasCustomerPinAuth(sql, phone);
  const pinCustomerId = hasPin ? await fetchPinAuthCustomerId(sql, phone) : null;

  const byPhone = phoneRows[0] || null;
  const byEmail = emailRows[0] || null;

  let duplicateSource = null;
  let foundCustomerId = null;

  if (byPhone) {
    duplicateSource = 'phone';
    foundCustomerId = Number(byPhone.id);
  } else if (indexedPhone?.customer_id) {
    duplicateSource = 'phone_index';
    foundCustomerId = Number(indexedPhone.customer_id);
  } else if (pinCustomerId) {
    duplicateSource = 'pin_auth';
    foundCustomerId = pinCustomerId;
  }

  if (byEmail) {
    const emailId = Number(byEmail.id);
    if (foundCustomerId && emailId !== foundCustomerId) {
      return {
        blocked: true,
        duplicateSource: 'phone_email_mismatch',
        foundCustomerId,
        emailCustomerId: emailId,
        normalizedPhone,
        normalizedEmail,
        hasPinAuth: hasPin,
        message: 'Bu telefon ve e-posta farklı hesaplara ait.'
      };
    }
    if (!duplicateSource) {
      duplicateSource = 'email';
      foundCustomerId = emailId;
    }
  } else if (indexedEmail?.customer_id && !duplicateSource) {
    duplicateSource = 'email_index';
    foundCustomerId = Number(indexedEmail.customer_id);
  }

  const customerMissing = foundCustomerId && !(await hasCustomerRow(sql, foundCustomerId));

  return {
    blocked: false,
    duplicateSource,
    foundCustomerId,
    normalizedPhone,
    normalizedEmail,
    hasPinAuth: hasPin,
    customerMissing,
    byPhone: Boolean(byPhone),
    byEmail: Boolean(byEmail),
    indexedPhone: Boolean(indexedPhone),
    indexedEmail: Boolean(indexedEmail)
  };
}

// Kayıt duplicate kararı — onarım ve net mesaj
export async function resolveRegistrationDuplicateDetailed(sql, phone, email) {
  let analysis = await inspectRegistrationConflict(sql, phone, email);

  if (analysis.customerMissing && analysis.foundCustomerId) {
    await repairIncompleteCustomer(sql, phone);
    analysis = await inspectRegistrationConflict(sql, phone, email);
  }

  if (analysis.blocked) {
    return {
      blocked: true,
      reason: analysis.message,
      duplicateSource: analysis.duplicateSource,
      foundCustomerId: analysis.foundCustomerId,
      normalizedPhone: analysis.normalizedPhone,
      normalizedEmail: analysis.normalizedEmail,
      hasPinAuth: analysis.hasPinAuth
    };
  }

  const { duplicateSource, foundCustomerId, hasPinAuth, normalizedPhone, normalizedEmail } = analysis;

  if (!duplicateSource && !hasPinAuth) {
    return { blocked: false, resumeCustomer: null, duplicateSource: null, foundCustomerId: null, hasPinAuth: false };
  }

  if (hasPinAuth || duplicateSource === 'pin_auth') {
    const message = duplicateSource === 'email' || duplicateSource === 'email_index'
      ? 'Bu e-posta zaten kayıtlı. Giriş yap veya PIN sıfırla.'
      : 'Bu telefon zaten kayıtlı. Giriş yap veya PIN sıfırla.';
    return {
      blocked: true,
      reason: message,
      duplicateSource: duplicateSource || 'pin_auth',
      foundCustomerId,
      normalizedPhone,
      normalizedEmail,
      hasPinAuth: true
    };
  }

  const { customerRowToRecord } = await import('./customersStore.js');
  const existing = foundCustomerId
    ? customerRowToRecord((await sql`SELECT * FROM customers WHERE id = ${foundCustomerId} LIMIT 1`)[0])
    : null;

  return {
    blocked: false,
    resumeCustomer: existing,
    duplicateSource,
    foundCustomerId,
    normalizedPhone,
    normalizedEmail,
    hasPinAuth: false
  };
}
