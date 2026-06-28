import { getSql } from './appState.js';
import { invalidateAppStateCache } from './appStateCache.js';
import { bumpAppStateRevision } from './relationalState.js';
import { findCustomerById, upsertLoyaltyRow } from './customersStore.js';
import { loadLoyaltyForCustomer, insertLoyaltyEvent } from './loyaltyStore.js';
import { applyCategoryStamp } from './loyaltyOps.js';
import {
  ensureDailyClaimsSchema,
  loadDailyClaimsForCustomer,
  insertDailyClaim
} from './dailyClaimsStore.js';

// Gün anahtarı — Türkiye saatine sabit (istemci cihaz saatiyle uyumlu).
// Sunucu UTC çalıştığı için sabit TZ olmadan gece saatlerinde gün kayardı.
function localDayKey() {
  // en-CA biçimi YYYY-MM-DD üretir
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

// Giriş serisi hesapla
function getCustomerStreak(dailyClaims, customerId) {
  const days = new Set(
    (dailyClaims || [])
      .filter((row) => Number(row.customerId) === Number(customerId) && row.type === 'daily_login')
      .map((row) => row.day)
  );
  if (!days.size) return 0;

  let streak = 0;
  const cursor = new Date();
  const today = localDayKey();
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);

  while (true) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (!days.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// LP kartını kaydet ve son işlemi geçmişe yaz
async function persistStampResult(sql, customerId, miniState) {
  const id = Number(customerId);
  const card = miniState.loyalty[id] || miniState.loyalty[String(id)];
  await upsertLoyaltyRow(sql, id, card);
  const entry = (miniState.history || [])[0];
  if (entry) await insertLoyaltyEvent(sql, id, entry);
}

// Günlük giriş ödülü — sunucuda kalıcı.
// YARIŞ KOŞULU KORUMASI: global app_state satırını kilitlemek yerine yalnızca
// ilgili müşterinin satırı "FOR UPDATE" ile kilitlenir; çift claim ise
// daily_claims tablosundaki (customer_id, type, day) tekilliğiyle engellenir.
// Böylece farklı müşteriler eşzamanlı claim yapabilir (global darboğaz yok).
export async function applyDailyLoginRewardRelational(customerId) {
  const sql = getSql();
  if (!sql) return { ok: false, error: 'Veritabanı yapılandırması eksik' };

  const id = Number(customerId);
  await ensureDailyClaimsSchema(sql);

  const day = localDayKey();
  const createdAt = new Date().toLocaleString('tr-TR');

  const outcome = await sql.begin(async (tx) => {
    // Yazma stall'ını DB tarafında sınırla (8sn) — bayat bağlantıda işlem iptal
    // edilip rollback olur; daily_claims unique constraint sayesinde retry güvenli.
    await tx`SET LOCAL statement_timeout = '8000ms'`;
    // Yalnızca bu müşterinin satırını kilitle — global blob kilidi yok
    const lockRows = await tx`SELECT id FROM customers WHERE id = ${id} FOR UPDATE`;
    if (!lockRows.length) return { ok: false, error: 'Üye bulunamadı' };

    const customer = await findCustomerById(tx, id);
    if (!customer) return { ok: false, error: 'Üye bulunamadı' };

    // Seri hesabı için bugünü içermeyen önceki claim'ler
    const priorClaims = await loadDailyClaimsForCustomer(tx, id, 'daily_login');
    const prevStreak = getCustomerStreak(priorClaims, id);

    // Bugünkü claim'i idempotent ekle; çakışırsa bugün zaten alınmış
    const inserted = await insertDailyClaim(tx, {
      id: Date.now(),
      customerId: id,
      type: 'daily_login',
      day,
      name: customer.name,
      phone: customer.phone,
      createdAt
    });
    if (!inserted) {
      return { ok: false, error: 'Günlük giriş ödülünü bugün zaten aldın.' };
    }

    const loyaltyCard = await loadLoyaltyForCustomer(id, tx);
    const miniState = {
      customers: [customer],
      loyalty: { [id]: loyaltyCard },
      history: []
    };

    let stampResult = applyCategoryStamp(miniState, id, 'coffee', 1, 'Günlük giriş ödülü');
    if (!stampResult.ok) return stampResult;
    await persistStampResult(tx, id, miniState);

    const newStreak = prevStreak + 1;
    let bonusNote = '';

    if (newStreak === 3) {
      stampResult = applyCategoryStamp(miniState, id, 'coffee', 1, '3 gün seri bonusu');
      if (!stampResult.ok) return stampResult;
      await persistStampResult(tx, id, miniState);
      bonusNote = ' 3 gün seri bonusu da eklendi!';
    }

    if (newStreak === 7) {
      stampResult = applyCategoryStamp(miniState, id, 'coffee', 2, '7 gün seri bonusu');
      if (!stampResult.ok) return stampResult;
      await persistStampResult(tx, id, miniState);
      bonusNote = ' 7 gün seri bonusu da eklendi!';
    }

    const nextCard = miniState.loyalty[id] || miniState.loyalty[String(id)];
    const dailyClaims = [
      { id: Date.now(), customerId: id, name: customer.name, phone: customer.phone, type: 'daily_login', day, createdAt },
      ...priorClaims
    ];

    return {
      ok: true,
      message: `+1 LP günlük giriş ödülü hesabına eklendi.${bonusNote}`,
      loyalty: nextCard,
      dailyClaims
    };
  });

  // Commit SONRASI: istemci sync'i için revizyonu bump et + önbelleği temizle.
  // Bu hızlı tek satır UPDATE'tir; eski global FOR UPDATE kilidinden farklı.
  if (outcome.ok) {
    await bumpAppStateRevision(sql);
    invalidateAppStateCache();
  }

  return outcome;
}
