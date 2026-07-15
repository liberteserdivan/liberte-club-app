/**
 * Canlı öncesi kritik güvenlik / veri bütünlüğü düzeltmeleri için testler.
 * Çalıştır: node --test tests/critical-fixes.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

// Basit, durum tutan SQL mock — tagged template + inList(sql, arr) + sql.begin destekler
function makeMockSql() {
  const queries = [];
  function sql(strings, ...values) {
    // inList(sql, arr) çağrısı: ilk arg düz dizi (template değil)
    if (Array.isArray(strings) && !strings.raw) {
      return { __fragment: strings.slice() };
    }
    const text = strings.join(' ? ');
    queries.push({ text, values });
    return Promise.resolve([]);
  }
  sql.begin = async (fn) => fn(sql);
  sql.queries = queries;
  return sql;
}

// --------------------------------------------------------------------------
// 1) Relational hesap silme — tüm kimlik tablolarından silme yapılmalı
// --------------------------------------------------------------------------
test('purgeCustomerRelational customers + auth + pin + email tablolarından siler', async () => {
  const { purgeCustomerRelational } = await import('../api/_lib/accountCleanup.js');
  const sql = makeMockSql();

  const ok = await purgeCustomerRelational(
    { customerId: 900123, phone: '5550100001', email: 'demo@liberte.cafe' },
    sql
  );

  assert.equal(ok, true);
  const all = sql.queries.map((q) => q.text).join('\n');
  assert.match(all, /DELETE FROM auth_sessions/, 'oturumlar silinmeli');
  assert.match(all, /DELETE FROM customer_pin_auth/, 'PIN kaydı silinmeli');
  assert.match(all, /DELETE FROM customer_emails/, 'e-posta indeksi silinmeli');
  assert.match(all, /DELETE FROM customers/, 'müşteri satırı silinmeli (CASCADE tetikler)');
});

test('adminAccountDelete relational modda purgeCustomerRelational kullanır', () => {
  const src = read('api/_lib/handlers/adminAccountDelete.js');
  assert.match(src, /useRelationalState\(\)/);
  assert.match(src, /purgeCustomerRelational/);
  // Son yönetici koruması korunmalı
  assert.match(src, /Son yönetici hesabı silinemez/);
});

// --------------------------------------------------------------------------
// 2) Loyalty race condition — kilitli read-modify-write update kaybetmez
// --------------------------------------------------------------------------
test('eşzamanlı iki damga KİLİTLİ akışta kaybolmaz (+2)', async () => {
  let stamps = 0;
  let locked = false;

  // SELECT ... FOR UPDATE davranışını taklit eden basit serileştirme
  async function withRowLock(fn) {
    while (locked) await new Promise((r) => setTimeout(r, 1));
    locked = true;
    try {
      return await fn();
    } finally {
      locked = false;
    }
  }
  async function applyStampTxn() {
    return withRowLock(async () => {
      const current = stamps;                       // oku (kilit altında)
      await new Promise((r) => setTimeout(r, 5));    // iş simülasyonu
      stamps = current + 1;                          // yaz
    });
  }

  await Promise.all([applyStampTxn(), applyStampTxn()]);
  assert.equal(stamps, 2, 'iki damga da işlenmeliydi');
});

test('KİLİTSİZ akış update kaybeder (regresyon kanıtı)', async () => {
  let stamps = 0;
  async function applyStampNoLock() {
    const current = stamps;
    await new Promise((r) => setTimeout(r, 5));
    stamps = current + 1;
  }
  await Promise.all([applyStampNoLock(), applyStampNoLock()]);
  // Kilit olmadan iki eşzamanlı işlem aynı değeri okur → bir damga kaybolur
  assert.equal(stamps, 1, 'kilitsizken update kaybı beklenir');
});

test('applyLoyaltyActionRelational transaction + FOR UPDATE kullanır', () => {
  const src = read('api/_lib/loyaltyStore.js');
  assert.match(src, /sql\.begin\(/, 'transaction kullanılmalı');
  assert.match(src, /FOR UPDATE/, 'müşteri satırı kilitlenmeli');
});

// --------------------------------------------------------------------------
// 3) Customer email update — /api/state ile değişemez (state-security.test.mjs'te de)
// --------------------------------------------------------------------------
test('SAFE_PROFILE_FIELDS email içermez', async () => {
  const { SAFE_PROFILE_FIELDS } = await import('../api/_lib/stateAccess.js');
  assert.ok(!SAFE_PROFILE_FIELDS.includes('email'), 'email güvenli profil alanı OLMAMALI');
  assert.ok(SAFE_PROFILE_FIELDS.includes('name'), 'name güvenli alan olmalı');
});

// --------------------------------------------------------------------------
// 4) Web token storage — web'de localStorage'a yazılmamalı
// --------------------------------------------------------------------------
test('apiClient web token storage: native dışı persist etmez', () => {
  const src = read('src/lib/apiClient.js');
  assert.match(src, /memoryAuthToken/, 'bellek tabanlı token tutulmalı');
  // saveAuthToken native değilse erken döner (localStorage.setItem'a ulaşmaz)
  assert.match(src, /if \(!isNativeApp\(\)\) return;/, 'web persist guard olmalı');
  assert.match(src, /LEGACY_TOKEN_KEYS/, 'logout tüm eski anahtarları temizlemeli');
});

// --------------------------------------------------------------------------
// 5) Admin snapshot — TTL + minimal alan + logout temizliği
// --------------------------------------------------------------------------
test('adminFullSnapshot TTL ve minimal alan uygular', async () => {
  // localStorage mock
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };

  const mod = await import('../src/lib/adminFullSnapshot.js');

  // Hassas alanlar (pushSubscriptions/feedback) snapshot'a yazılmamalı
  mod.saveAdminSnapshot({
    customers: [{ id: 1, name: 'A', phone: '5550000000' }],
    loyalty: { 1: { totalStamps: 2 } },
    settings: { cafe_name: 'Liberte' },
    pushSubscriptions: [{ token: 'gizli-token' }],
    feedback: [{ rating: 5 }]
  });

  const loaded = mod.loadAdminSnapshot();
  assert.ok(loaded, 'snapshot kaydedilmeli');
  assert.equal(loaded.data.pushSubscriptions, undefined, 'push tokenları snapshot\'a girmemeli');
  assert.equal(loaded.data.feedback, undefined, 'feedback snapshot\'a girmemeli');
  assert.ok(Array.isArray(loaded.data.customers), 'müşteri listesi korunmalı');

  // TTL: eski savedAt ile kayıt → load null dönmeli ve temizlemeli
  const expired = {
    savedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    customerCount: 1,
    data: { customers: [{ id: 1 }] }
  };
  store.set('liberteAdminSnapshot', JSON.stringify(expired));
  assert.equal(mod.loadAdminSnapshot(), null, 'süresi dolan snapshot null dönmeli');
  assert.equal(store.has('liberteAdminSnapshot'), false, 'süresi dolan snapshot temizlenmeli');

  delete globalThis.localStorage;
});

test('logoutSession admin snapshot temizliğini içerir', () => {
  const src = read('src/lib/session.js');
  assert.match(src, /clearAdminSnapshot/, 'çıkışta snapshot temizlenmeli');
});

// --------------------------------------------------------------------------
// 8) QR replay — nonce tek kullanımlık
// --------------------------------------------------------------------------
test('verifyCustomerQrToken nonce döndürür', async () => {
  const { createCustomerQrToken, verifyCustomerQrToken } = await import('../api/_lib/qrToken.js');
  const { token } = createCustomerQrToken(900123);
  const verified = verifyCustomerQrToken(token);
  assert.equal(verified.ok, true);
  assert.ok(verified.nonce && verified.nonce.length > 0, 'nonce dönmeli');
});

test('claimQrNonce aynı nonce+action için ikinci kez reddeder', async () => {
  const { claimQrNonce } = await import('../api/_lib/qrNonceStore.js');

  const used = new Set();
  function nonceSql(strings, ...values) {
    if (Array.isArray(strings) && !strings.raw) return strings;
    const text = strings.join('');
    if (text.includes('INSERT INTO qr_used_tokens')) {
      const key = `${values[0]}::${values[1]}`;
      if (used.has(key)) return Promise.resolve([]); // ON CONFLICT DO NOTHING
      used.add(key);
      return Promise.resolve([{ nonce: values[0] }]);
    }
    return Promise.resolve([]);
  }

  const first = await claimQrNonce(nonceSql, { nonce: 'abc', action: 'stamp', customerId: 1 });
  const second = await claimQrNonce(nonceSql, { nonce: 'abc', action: 'stamp', customerId: 1 });
  assert.equal(first.firstUse, true, 'ilk kullanım kabul edilmeli');
  assert.equal(second.firstUse, false, 'replay reddedilmeli');
});

test('handleAdminLoyaltyAction replay\'de 409 döner', () => {
  const src = read('api/_lib/handlers/adminLoyalty.js');
  // Nonce claim loyaltyStore TX icinde; handler replay sonucunu 409 yapar
  assert.match(src, /applyLoyaltyActionRelational/);
  assert.match(src, /409/);
  assert.match(src, /QR_REPLAY/);
  assert.match(src, /RELATIONAL_REQUIRED/);
});

test('nonce claim loyalty transaction İÇİNDE yapılır (atomik) - hata olursa geri alınır', () => {
  const src = read('api/_lib/loyaltyStore.js');
  // claimQrNonce transaction (tx) üzerinde çağrılmalı ki rollback nonce'u da geri alsın
  assert.match(src, /claimQrNonce\(tx/, 'nonce claim transaction içinde (tx) yapılmalı');
  assert.match(src, /replay:\s*true/, 'replay durumu dönmeli');
  // Relational handler ön-claim yapmamalı; nonce'u fonksiyona geçirmeli
  const handler = read('api/_lib/handlers/adminLoyalty.js');
  assert.match(handler, /nonce:\s*verified\.nonce/, 'handler nonce\'u relational fonksiyona geçirmeli');
  assert.match(handler, /result\.replay/, 'handler replay sonucunu kontrol etmeli');
});

// --------------------------------------------------------------------------
// 9) DB constraints — migration dosyası benzersizlik indekslerini içerir
// --------------------------------------------------------------------------
test('004 migration unique constraint ve qr_used_tokens içerir', () => {
  const sqlText = read('scripts/sql/004_unique_constraints.sql');
  assert.match(sqlText, /ux_customers_normalized_phone/);
  assert.match(sqlText, /ux_customers_referral_code/);
  assert.match(sqlText, /ux_push_subscriptions_token/);
  assert.match(sqlText, /qr_used_tokens/);
});

test('customer_emails.email PK → mükerrer e-posta race engellenir', () => {
  // upsertCustomerEmail ON CONFLICT (email) ile tek satır garantisi verir
  const src = read('api/_lib/customerEmails.js');
  assert.match(src, /ON CONFLICT \(email\)/);
});

// --------------------------------------------------------------------------
// 10) Hardening — crypto.randomInt, HTML escape, input validation
// --------------------------------------------------------------------------
test('verificationMail crypto.randomInt ve HTML escape kullanır', () => {
  const src = read('api/_lib/verificationMail.js');
  assert.match(src, /randomInt/, 'crypto.randomInt kullanılmalı');
  assert.ok(!/Math\.random\(/.test(src), 'Math.random() çağrısı kullanılmamalı');
  assert.match(src, /escapeHtml/, 'kullanıcı içeriği escape edilmeli');
});

test('validateInput yardımcıları doğru çalışır', async () => {
  const { clampString, oneOfOrDefault, isBodyTooLarge } = await import('../api/_lib/validateInput.js');
  assert.equal(clampString('abcdef', 3), 'abc');
  assert.equal(clampString(null, 5), '');
  assert.equal(oneOfOrDefault('IOS', ['web', 'ios', 'android'], 'web'), 'ios');
  assert.equal(oneOfOrDefault('hack', ['web', 'ios'], 'web'), 'web');
  assert.equal(isBodyTooLarge('x'.repeat(10), 100), false);
  assert.equal(isBodyTooLarge('x'.repeat(200), 100), true);
});

test('push register endpoint input validation uygular', () => {
  const src = read('api/_lib/handlers/pushRegisterDevice.js');
  assert.match(src, /isBodyTooLarge/);
  assert.match(src, /oneOfOrDefault/);
  assert.match(src, /clampString/);
});

test('error log oluşturma input validation uygular', () => {
  const src = read('api/state.js');
  assert.match(src, /isBodyTooLarge/);
  assert.match(src, /ERROR_LOG_LEVELS/);
  assert.match(src, /clampString/);
});
