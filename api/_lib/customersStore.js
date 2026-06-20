import { cleanPhone, phoneLookupVariants } from './phone.js';
import { normalizeEmail, findCustomerIdByPhone } from './customerEmails.js';
import { generateUniqueReferralCode } from './referralCode.js';
import { loyaltyTemplate } from './loyaltyOps.js';
import { migrateLoyaltyCard, getCategoryLpGain, levelByLp } from './loyaltyPointsServer.js';
import { isProductionRuntime } from './schemaReady.js';

// Normalize müşteri tablolarını hazırla — production'da bootstrap SQL yeterli
export async function ensureCustomersTables(sql) {
  if (isProductionRuntime()) return;
  await sql`CREATE TABLE IF NOT EXISTS customers (
    id bigint PRIMARY KEY,
    phone text NOT NULL,
    name text NOT NULL,
    email text,
    birth_date text,
    referral_code text,
    is_admin boolean NOT NULL DEFAULT false,
    created_at text,
    last_visit text,
    legacy_json jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone)`;
  await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS normalized_phone text`;
  await sql`CREATE INDEX IF NOT EXISTS idx_customers_normalized_phone ON customers (normalized_phone)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_customers_referral_code ON customers (referral_code)`;
  await sql`CREATE TABLE IF NOT EXISTS customer_loyalty (
    customer_id bigint PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
    total_stamps int NOT NULL DEFAULT 0,
    lifetime_stamps int NOT NULL DEFAULT 0,
    available_rewards int NOT NULL DEFAULT 0,
    used_rewards int NOT NULL DEFAULT 0,
    level text,
    category_stamps jsonb NOT NULL DEFAULT '{}'::jsonb,
    category_rewards jsonb NOT NULL DEFAULT '{}'::jsonb,
    lp_balance int,
    lp_lifetime int,
    lp_schema_version int,
    legacy_json jsonb,
    revision bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
}

// SQL satırını API müşteri nesnesine çevir
export function customerRowToRecord(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    phone: cleanPhone(row.phone),
    name: String(row.name || 'Liberte Üye'),
    email: normalizeEmail(row.email || ''),
    birthDate: row.birth_date || '',
    referralCode: row.referral_code || null,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at || new Date().toLocaleString('tr-TR'),
    lastVisit: row.last_visit || null,
    referredBy: row.referred_by ? Number(row.referred_by) : null
  };
}

// Sadakat satırını API kartına çevir
export function loyaltyRowToCard(row, customerId) {
  if (!row) return loyaltyTemplate(customerId);
  const legacy = row.legacy_json && typeof row.legacy_json === 'object' ? row.legacy_json : null;
  if (legacy) return migrateLoyaltyCard(legacy);
  return migrateLoyaltyCard({
    customerId,
    schemaVersion: row.lp_schema_version || 2,
    lpBalance: row.lp_balance ?? 0,
    lpLifetime: row.lp_lifetime ?? 0,
    usedRewards: row.used_rewards ?? 0,
    level: row.level || 'Bronze',
    categoryStamps: row.category_stamps || {},
    categoryRewards: row.category_rewards || {},
    totalStamps: row.total_stamps ?? 0,
    availableRewards: row.available_rewards ?? 0,
    lifetimeStamps: row.lifetime_stamps ?? 0
  });
}

// Telefon satırını normalize alanlarla eşleştir
async function resolveCustomerRowByPhone(sql, phone) {
  const normalized = cleanPhone(phone);
  if (!sql || normalized.length < 10) return null;

  await ensureCustomersTables(sql);
  const variants = phoneLookupVariants(phone);

  const rows = await sql`
    SELECT id, phone, name, email, birth_date, referral_code, is_admin, created_at, last_visit, normalized_phone
    FROM customers
    WHERE normalized_phone = ${normalized}
       OR phone = ANY(${variants})
    ORDER BY is_admin DESC, id ASC
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  // Eski format kayıtları canonical forma çek
  if (row.normalized_phone !== normalized || cleanPhone(row.phone) !== normalized) {
    await sql`
      UPDATE customers
      SET phone = ${normalized},
          normalized_phone = ${normalized},
          updated_at = now()
      WHERE id = ${Number(row.id)}
    `;
    row.phone = normalized;
    row.normalized_phone = normalized;
  }

  return row;
}

// Telefon ile müşteri bul — yarım kayıt varsa onar
export async function findCustomerByPhone(sql, phone) {
  const row = await resolveCustomerRowByPhone(sql, phone);
  if (row) return customerRowToRecord(row);

  const { repairIncompleteCustomer } = await import('./customerPhoneRepair.js');
  return repairIncompleteCustomer(sql, phone);
}

// E-posta ile müşteri bul
export async function findCustomerByEmail(sql, email) {
  const normalized = normalizeEmail(email);
  if (!sql || !normalized) return null;
  await ensureCustomersTables(sql);
  const rows = await sql`
    SELECT id, phone, name, email, birth_date, referral_code, is_admin, created_at, last_visit
    FROM customers
    WHERE lower(email) = ${normalized}
    LIMIT 1
  `;
  return customerRowToRecord(rows[0]);
}

// Kimlik ile müşteri bul
export async function findCustomerById(sql, customerId) {
  if (!sql || !customerId) return null;
  await ensureCustomersTables(sql);
  const rows = await sql`
    SELECT id, phone, name, email, birth_date, referral_code, is_admin, created_at, last_visit
    FROM customers
    WHERE id = ${Number(customerId)}
    LIMIT 1
  `;
  return customerRowToRecord(rows[0]);
}

// Referans kodu ile müşteri bul
export async function findCustomerByReferralCode(sql, inviteCode) {
  const clean = String(inviteCode || '').trim().toUpperCase().replace(/\s/g, '');
  if (!sql || !clean) return null;
  await ensureCustomersTables(sql);
  const rows = await sql`
    SELECT id, phone, name, email, birth_date, referral_code, is_admin, created_at, last_visit
    FROM customers
    WHERE upper(referral_code) = ${clean}
    LIMIT 1
  `;
  return customerRowToRecord(rows[0]);
}

// Sadakat kartını oku
export async function findLoyaltyByCustomerId(sql, customerId) {
  if (!sql || !customerId) return null;
  await ensureCustomersTables(sql);
  const rows = await sql`
    SELECT *
    FROM customer_loyalty
    WHERE customer_id = ${Number(customerId)}
    LIMIT 1
  `;
  return rows[0] || null;
}

// Yeni üye hoş geldin bonuslu sadakat kartı
export function buildWelcomeLoyalty(customerId, extraCoffeeStamps = 0) {
  const coffeeSteps = 2 + extraCoffeeStamps;
  const lpGain = getCategoryLpGain('coffee') * coffeeSteps;
  const base = loyaltyTemplate(customerId);
  return migrateLoyaltyCard({
    ...base,
    lpBalance: lpGain,
    lpLifetime: lpGain,
    categoryStamps: { ...base.categoryStamps, coffee: coffeeSteps },
    totalStamps: coffeeSteps,
    lifetimeStamps: coffeeSteps,
    level: levelByLp(lpGain)
  });
}

// Kayıt çakışması — detaylı duplicate analizi
export async function resolveRegistrationDuplicate(sql, phone, email) {
  const { resolveRegistrationDuplicateDetailed } = await import('./customerPhoneRepair.js');
  const result = await resolveRegistrationDuplicateDetailed(sql, phone, email);
  if (result.blocked) {
    return { blocked: true, reason: result.reason, duplicateSource: result.duplicateSource };
  }
  return { blocked: false, resumeCustomer: result.resumeCustomer };
}

// Yeni müşteri kaydı oluştur
export function buildNewCustomerRecord({ phone, email, name, birthDate, referredBy, existingCodes = [] }) {
  return {
    id: Date.now(),
    phone: cleanPhone(phone),
    name: String(name || 'Liberte Üye').trim(),
    email: normalizeEmail(email),
    birthDate: String(birthDate || ''),
    referralCode: generateUniqueReferralCode(existingCodes.map((c) => ({ referralCode: c }))),
    isAdmin: false,
    referredBy: referredBy || null,
    createdAt: new Date().toLocaleString('tr-TR'),
    lastVisit: new Date().toISOString()
  };
}

// Müşteri satırı yaz
export async function upsertCustomerRow(sql, customer) {
  await ensureCustomersTables(sql);
  const normalizedPhone = cleanPhone(customer.phone);
  await sql`
    INSERT INTO customers (id, phone, normalized_phone, name, email, birth_date, referral_code, is_admin, created_at, last_visit, legacy_json)
    VALUES (
      ${Number(customer.id)},
      ${normalizedPhone},
      ${normalizedPhone},
      ${String(customer.name || '')},
      ${customer.email || null},
      ${customer.birthDate || null},
      ${customer.referralCode || null},
      ${Boolean(customer.isAdmin)},
      ${customer.createdAt || null},
      ${customer.lastVisit || null},
      ${JSON.stringify(customer)}
    )
    ON CONFLICT (id) DO UPDATE SET
      phone = EXCLUDED.phone,
      normalized_phone = EXCLUDED.normalized_phone,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      birth_date = EXCLUDED.birth_date,
      referral_code = EXCLUDED.referral_code,
      is_admin = EXCLUDED.is_admin,
      last_visit = EXCLUDED.last_visit,
      legacy_json = EXCLUDED.legacy_json,
      updated_at = now()
  `;
}

// Sadakat satırı yaz
export async function upsertLoyaltyRow(sql, customerId, card) {
  await ensureCustomersTables(sql);
  const migrated = migrateLoyaltyCard(card);
  await sql`
    INSERT INTO customer_loyalty (
      customer_id, total_stamps, lifetime_stamps, available_rewards, used_rewards,
      level, category_stamps, category_rewards, lp_balance, lp_lifetime, lp_schema_version, legacy_json
    )
    VALUES (
      ${Number(customerId)},
      ${Number(migrated.totalStamps || 0)},
      ${Number(migrated.lifetimeStamps || 0)},
      ${Number(migrated.availableRewards || 0)},
      ${Number(migrated.usedRewards || 0)},
      ${migrated.level || 'Bronze'},
      ${JSON.stringify(migrated.categoryStamps || {})},
      ${JSON.stringify(migrated.categoryRewards || {})},
      ${migrated.lpBalance ?? 0},
      ${migrated.lpLifetime ?? 0},
      ${migrated.schemaVersion ?? 2},
      ${JSON.stringify(migrated)}
    )
    ON CONFLICT (customer_id) DO UPDATE SET
      total_stamps = EXCLUDED.total_stamps,
      lifetime_stamps = EXCLUDED.lifetime_stamps,
      available_rewards = EXCLUDED.available_rewards,
      used_rewards = EXCLUDED.used_rewards,
      level = EXCLUDED.level,
      category_stamps = EXCLUDED.category_stamps,
      category_rewards = EXCLUDED.category_rewards,
      lp_balance = EXCLUDED.lp_balance,
      lp_lifetime = EXCLUDED.lp_lifetime,
      lp_schema_version = EXCLUDED.lp_schema_version,
      legacy_json = EXCLUDED.legacy_json,
      revision = customer_loyalty.revision + 1,
      updated_at = now()
  `;
}

// Referans verene bonus LP ekle
export async function applyReferrerBonus(sql, referrerId, customerName) {
  const existing = await findLoyaltyByCustomerId(sql, referrerId);
  const card = existing
    ? loyaltyRowToCard(existing, referrerId)
    : loyaltyTemplate(referrerId);
  const lpGain = getCategoryLpGain('coffee') * 2;
  const next = migrateLoyaltyCard({
    ...card,
    lpBalance: (card.lpBalance || 0) + lpGain,
    lpLifetime: (card.lpLifetime || 0) + lpGain,
    categoryStamps: { ...card.categoryStamps, coffee: (card.categoryStamps?.coffee || 0) + 2 },
    totalStamps: (card.totalStamps || 0) + 2,
    lifetimeStamps: (card.lifetimeStamps || 0) + 2,
    level: levelByLp((card.lpLifetime || 0) + lpGain)
  });
  await upsertLoyaltyRow(sql, referrerId, next);
  return next;
}

// Telefon numarasına admin yetkisi ver
export async function grantAdminByPhone(sql, phone) {
  const normalized = cleanPhone(phone);
  if (!sql || normalized.length < 10) return null;

  await ensureCustomersTables(sql);
  let customer = await findCustomerByPhone(sql, normalized);

  if (!customer) {
    const indexed = await findCustomerIdByPhone(sql, normalized);
    if (indexed?.customer_id) {
      customer = {
        id: Number(indexed.customer_id),
        phone: normalized,
        name: 'Liberte Üye',
        email: normalizeEmail(indexed.email || ''),
        birthDate: '',
        referralCode: generateUniqueReferralCode([]),
        isAdmin: true,
        createdAt: new Date().toLocaleString('tr-TR'),
        lastVisit: new Date().toISOString()
      };
    }
  } else {
    customer = { ...customer, isAdmin: true };
  }

  if (!customer) {
    customer = {
      id: Date.now(),
      phone: normalized,
      name: 'Liberte Admin',
      email: '',
      birthDate: '',
      referralCode: generateUniqueReferralCode([]),
      isAdmin: true,
      createdAt: new Date().toLocaleString('tr-TR'),
      lastVisit: new Date().toISOString()
    };
  }

  await upsertCustomerRow(sql, customer);
  const loyalty = await findLoyaltyByCustomerId(sql, customer.id);
  if (!loyalty) {
    await upsertLoyaltyRow(sql, customer.id, loyaltyTemplate(customer.id));
  }

  await sql`
    UPDATE auth_sessions
    SET role = 'admin'
    WHERE customer_id = ${Number(customer.id)}
      AND expires_at > now()
  `;

  return customer;
}

// Yönetici paneli — tüm üye listesi
export async function listAllCustomers(sql) {
  if (!sql) return [];
  await ensureCustomersTables(sql);
  const rows = await sql`
    SELECT id, phone, name, email, birth_date, referral_code, is_admin, created_at, last_visit
    FROM customers
    ORDER BY id ASC
  `;
  return rows.map(customerRowToRecord);
}

// Üyeyi normalize tablodan sil — CASCADE ile sadakat kayıtları da gider
export async function deleteCustomerById(sql, customerId) {
  const id = Number(customerId);
  if (!sql || !id) return false;
  await ensureCustomersTables(sql);
  await sql`DELETE FROM customers WHERE id = ${id}`;
  return true;
}
