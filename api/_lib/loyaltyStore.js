import { getSql } from './sql.js';
import {
  ensureCustomersTables,
  customerRowToRecord,
  findCustomerById,
  findLoyaltyByCustomerId,
  loyaltyRowToCard,
  upsertLoyaltyRow
} from './customersStore.js';
import {
  applyCategoryStamp,
  applyCheckIn,
  applyBirthdayCoffee,
  applyTierDiscount,
  customerSummary,
  redeemCategoryReward
} from './loyaltyOps.js';
import { bumpAppStateRevision } from './relationalState.js';
import { claimQrNonce } from './qrNonceStore.js';

// loyalty_events satırını history formatına çevir
function eventRowToHistory(row) {
  if (row.legacy_json && typeof row.legacy_json === 'object') {
    return row.legacy_json;
  }
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    type: row.event_type,
    category: row.category || null,
    delta: row.delta != null ? Number(row.delta) : null,
    note: row.note || null,
    menuItemId: row.menu_item_id != null ? Number(row.menu_item_id) : null,
    menuItemName: row.menu_item_name || null,
    createdAt: row.created_at || new Date().toLocaleString('tr-TR')
  };
}

// Sadakat geçmişini SQL'den oku
export async function loadHistoryFromSql(externalSql = null, customerId = null) {
  const sql = externalSql || getSql();
  if (!sql) return [];

  await ensureCustomersTables(sql);
  const rows = customerId
    ? await sql`
        SELECT *
        FROM loyalty_events
        WHERE customer_id = ${Number(customerId)}
        ORDER BY id DESC
        LIMIT 80
      `
    : await sql`
        SELECT *
        FROM loyalty_events
        ORDER BY id DESC
        LIMIT 2000
      `;

  return rows.map(eventRowToHistory);
}

// Tüm sadakat kartlarını map olarak oku
export async function loadLoyaltyMapFromSql(externalSql = null) {
  const sql = externalSql || getSql();
  if (!sql) return {};

  await ensureCustomersTables(sql);
  const rows = await sql`SELECT * FROM customer_loyalty`;
  const map = {};
  for (const row of rows) {
    const id = Number(row.customer_id);
    map[id] = loyaltyRowToCard(row, id);
  }
  return map;
}

// Üye listesi için hafif sadakat map — legacy_json atlanır (payload ve süre düşer)
export async function loadLoyaltyMapLightFromSql(externalSql = null) {
  const sql = externalSql || getSql();
  if (!sql) return {};

  await ensureCustomersTables(sql);
  const rows = await sql`
    SELECT customer_id, total_stamps, lifetime_stamps, available_rewards, used_rewards,
           level, category_stamps, category_rewards, lp_balance, lp_lifetime, lp_schema_version
    FROM customer_loyalty
  `;
  const map = {};
  for (const row of rows) {
    const id = Number(row.customer_id);
    map[id] = loyaltyRowToCard(row, id);
  }
  return map;
}

// Tek müşteri sadakat kartını oku
export async function loadLoyaltyForCustomer(customerId, externalSql = null) {
  const sql = externalSql || getSql();
  if (!sql || !customerId) return null;
  const row = await findLoyaltyByCustomerId(sql, customerId);
  return loyaltyRowToCard(row, customerId);
}

// Doğum günü kahvesi dedup'ı için geçmiş doğum günü olaylarını oku (tek iş).
// RB-7: applyBirthdayCoffee, "bu yıl kullanıldı mı" kontrolünü history üzerinden
// yapar; relational akışta miniState.history boş başlatıldığından bu olaylar
// DB'den yüklenmezse müşteri doğum gününde tekrar tekrar ikram alabilir.
export async function loadBirthdayHistory(sql, customerId) {
  const rows = await sql`
    SELECT *
    FROM loyalty_events
    WHERE customer_id = ${Number(customerId)}
      AND event_type IN ('birthday_coffee', 'birthday_reward')
    ORDER BY id DESC
    LIMIT 50
  `;
  return rows.map(eventRowToHistory);
}

// Sadakat olayını kaydet
export async function insertLoyaltyEvent(sql, customerId, historyEntry) {
  const createdAt = historyEntry.createdAt
    ? new Date(String(historyEntry.createdAt).replace(
      /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
      (_, d, m, y, h, min, s) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min}:${s}`
    ))
    : null;

  await sql`
    INSERT INTO loyalty_events (
      customer_id, event_type, category, delta, note, menu_item_id, menu_item_name, created_at, legacy_json
    )
    VALUES (
      ${Number(customerId)},
      ${historyEntry.type || historyEntry.eventType || 'unknown'},
      ${historyEntry.category || null},
      ${historyEntry.delta != null ? Number(historyEntry.delta) : null},
      ${historyEntry.note || historyEntry.source || null},
      ${historyEntry.menuItemId != null ? Number(historyEntry.menuItemId) : null},
      ${historyEntry.menuItemName || null},
      ${createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : sql`now()`},
      ${JSON.stringify(historyEntry)}
    )
  `;
}

// Tek işlem için sadakat değişimini hesapla — saf alan (transaction içinde çağrılır)
function computeLoyaltyMutation(miniState, { customerId, action, category, menuItem, note, count = 1 }) {
  const steps = Math.max(1, Math.min(10, Math.trunc(Number(count) || 1)));
  let result;
  if (action === 'stamp') {
    result = applyCategoryStamp(miniState, customerId, category, steps, note, { menuItem });
  } else if (action === 'remove') {
    result = applyCategoryStamp(miniState, customerId, category, -1, 'QR düzeltme');
  } else if (action === 'redeem') {
    result = redeemCategoryReward(miniState, customerId, category, 'QR kasiyer');
  } else if (action === 'checkin') {
    result = applyCheckIn(miniState, customerId, 'Kasa QR check-in');
  } else if (action === 'tier_discount') {
    result = applyTierDiscount(miniState, customerId, 'QR kasiyer');
  } else if (action === 'birthday_coffee') {
    result = applyBirthdayCoffee(miniState, customerId, 'QR kasiyer');
  } else if (action === 'google_review_bonus') {
    result = applyCategoryStamp(miniState, customerId, category, 3, note || 'Admin Google yorum onayı');
    if (result.ok && miniState.history?.[0]) {
      miniState.history[0].type = 'google_review_bonus';
      miniState.history[0].count = 3;
    }
  } else {
    return { ok: false, error: 'Geçersiz işlem' };
  }

  return result;
}

// Kasa QR sadakat işlemi — normalize tablolara yaz.
// YARIŞ KOŞULU KORUMASI: read-modify-write tek transaction içinde yapılır ve
// müşteri satırı "SELECT ... FOR UPDATE" ile kilitlenir. Böylece aynı müşteriye
// eşzamanlı iki işlem geldiğinde ikincisi birincinin commit'ini bekler; iki
// LP/damga da kaybolmadan üst üste işlenir (lost update engellenir).
export async function applyLoyaltyActionRelational({
  customerId,
  action,
  category = 'coffee',
  menuItem = null,
  note = 'QR kamera',
  count = 1,
  nonce = null
}) {
  const sql = getSql();
  if (!sql) throw new Error('DATABASE_URL eksik');

  const id = Number(customerId);

  return sql.begin(async (tx) => {
    // Yazma stall'ını DB tarafında sınırla — bayat bağlantıda işlem 8sn içinde
    // iptal edilir ve transaction rollback olur (çift yazma OLMAZ). Client tarafı
    // körlemesine Promise.race timeout kullanmadığımız için idempotent retry güvenli.
    await tx`SET LOCAL statement_timeout = '8000ms'`;
    // Müşteri satırını kilitle — eşzamanlı işlemleri bu müşteri için serileştirir
    const lockedRows = await tx`
      SELECT id, phone, name, email, birth_date, referral_code, is_admin, created_at, last_visit
      FROM customers
      WHERE id = ${id}
      FOR UPDATE
    `;
    if (!lockedRows[0]) {
      return { ok: false, error: 'Müşteri bulunamadı' };
    }

    // REPLAY KORUMASI transaction İÇİNDE: nonce claim ile loyalty mutasyonu atomik.
    // İşlem sonradan hata atarsa (transient DB) nonce kaydı da geri alınır (rollback),
    // böylece runSql retry temiz şekilde yeniden deneyebilir. Gerçek tekrar ise
    // (eşzamanlı/replay) FOR UPDATE kilidi + unique (nonce,action) ile engellenir.
    if (nonce) {
      const claim = await claimQrNonce(tx, { nonce, action, customerId: id });
      if (!claim.firstUse) {
        return { ok: false, replay: true, error: 'Bu QR kodu bu işlem için zaten kullanıldı. Müşteri ekranı QR\'ı yenilesin.' };
      }
    }

    const customer = customerRowToRecord(lockedRows[0]);
    // Kilit altındaki güncel sadakat kartını oku (transaction'da)
    const loyaltyRow = await findLoyaltyByCustomerId(tx, id);
    const loyaltyCard = loyaltyRowToCard(loyaltyRow, id);

    const miniState = {
      customers: [customer],
      loyalty: { [id]: loyaltyCard },
      history: []
    };

    // RB-7: Doğum günü kahvesi yılda bir kez. Dedup kontrolü geçmiş üzerinden
    // yapıldığından, bu işlemde önceki doğum günü olaylarını kilit altında yükle.
    if (action === 'birthday_coffee') {
      miniState.history = await loadBirthdayHistory(tx, id);
    }

    const result = computeLoyaltyMutation(miniState, { customerId: id, action, category, menuItem, note, count });
    if (!result.ok) {
      return result;
    }

    const nextCard = miniState.loyalty[id] || miniState.loyalty[String(id)];
    await upsertLoyaltyRow(tx, id, nextCard);

    const lastHistory = (miniState.history || [])[0];
    if (lastHistory) {
      await insertLoyaltyEvent(tx, id, lastHistory);
    }

    await bumpAppStateRevision(tx);

    const summaryState = {
      customers: miniState.customers,
      loyalty: miniState.loyalty,
      history: miniState.history
    };

    return {
      ok: true,
      customer: customerSummary(summaryState, id),
      loyalty: nextCard
    };
  });
}

// QR doğrulama — müşteri özeti normalize tablodan
export async function loadCustomerSummaryRelational(customerId) {
  const sql = getSql();
  if (!sql) return null;

  const customer = await findCustomerById(sql, customerId);
  if (!customer) return null;

  const loyalty = await loadLoyaltyForCustomer(customerId, sql);
  const miniState = {
    customers: [customer],
    loyalty: { [customerId]: loyalty },
    history: []
  };

  return customerSummary(miniState, customerId);
}
