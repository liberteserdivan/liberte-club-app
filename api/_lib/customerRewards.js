import { getSql } from './appState.js';
import { parseAppStateData, serializeAppStateJson } from './appState.js';
import { invalidateAppStateCache } from './appStateCache.js';
import { extractGlobalSlice, bumpAppStateRevision } from './relationalState.js';
import { findCustomerById, loyaltyRowToCard, upsertLoyaltyRow } from './customersStore.js';
import { loadLoyaltyForCustomer, insertLoyaltyEvent } from './loyaltyStore.js';
import { applyCategoryStamp } from './loyaltyOps.js';

const STATE_ID = 'liberte';

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

// Bugün bu ödül alınmış mı?
function hasDailyClaim(dailyClaims, customerId, type) {
  const day = localDayKey();
  return (dailyClaims || []).some(
    (row) => Number(row.customerId) === Number(customerId) && row.type === type && row.day === day
  );
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
// YARIŞ KOŞULU KORUMASI: tüm akış tek transaction içinde ve app_state satırı
// "FOR UPDATE" ile kilitlenir. dailyClaims global bir JSON blob olduğundan,
// kilit olmadan iki eşzamanlı talep (aynı veya farklı kullanıcı) blob'u
// birbirinin üzerine yazıp çifte ödül / kayıp kayıt üretebiliyordu.
export async function applyDailyLoginRewardRelational(customerId) {
  const sql = getSql();
  if (!sql) return { ok: false, error: 'Veritabanı yapılandırması eksik' };

  const id = Number(customerId);

  const outcome = await sql.begin(async (tx) => {
    // app_state satırını kilitle — global dailyClaims blob'una yazımları serileştirir
    const lockRows = await tx`SELECT data FROM app_state WHERE id = ${STATE_ID} FOR UPDATE`;

    const customer = await findCustomerById(tx, id);
    if (!customer) return { ok: false, error: 'Üye bulunamadı' };

    const raw = parseAppStateData(lockRows[0]?.data) || {};
    const global = extractGlobalSlice(raw) || raw;
    const dailyClaims = Array.isArray(global.dailyClaims) ? [...global.dailyClaims] : [];

    if (hasDailyClaim(dailyClaims, id, 'daily_login')) {
      return { ok: false, error: 'Günlük giriş ödülünü bugün zaten aldın.' };
    }

    const loyaltyCard = await loadLoyaltyForCustomer(id, tx);
    const miniState = {
      customers: [customer],
      loyalty: { [id]: loyaltyCard },
      history: [],
      dailyClaims
    };

    const prevStreak = getCustomerStreak(dailyClaims, id);
    const day = localDayKey();
    const createdAt = new Date().toLocaleString('tr-TR');

    let stampResult = applyCategoryStamp(miniState, id, 'coffee', 1, 'Günlük giriş ödülü');
    if (!stampResult.ok) return stampResult;
    await persistStampResult(tx, id, miniState);

    dailyClaims.unshift({
      id: Date.now(),
      customerId: id,
      name: customer.name,
      phone: customer.phone,
      type: 'daily_login',
      day,
      createdAt
    });
    miniState.dailyClaims = dailyClaims;

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

    global.dailyClaims = dailyClaims;
    // Kilitli satırı transaction içinde güncelle (writeGlobalBlob kendi sql'ini kullanır,
    // burada kilidi korumak için doğrudan tx ile yazıyoruz)
    await tx`
      UPDATE app_state
      SET data = ${serializeAppStateJson(global)},
          updated_at = now()
      WHERE id = ${STATE_ID}
    `;
    await bumpAppStateRevision(tx);

    const nextCard = miniState.loyalty[id] || miniState.loyalty[String(id)];

    return {
      ok: true,
      message: `+1 LP günlük giriş ödülü hesabına eklendi.${bonusNote}`,
      loyalty: nextCard,
      dailyClaims
    };
  });

  // Önbelleği commit SONRASI temizle — transaction ortasında değil
  if (outcome.ok) invalidateAppStateCache();

  return outcome;
}
