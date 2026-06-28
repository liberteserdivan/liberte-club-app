import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// 1) remoteFetch: oturum geçişinde backoff sıfırlanır (eski backoff yeni girişi
//    engellememeli). markRemoteFetchFailure ile blokla, reset ile temizle.
// ---------------------------------------------------------------------------
test('resetRemoteFetchState backoff durumunu temizler', async () => {
  const {
    markRemoteFetchFailure,
    isRemoteFetchBlocked,
    resetRemoteFetchState
  } = await import('../src/lib/remoteFetch.js');

  markRemoteFetchFailure();
  assert.equal(isRemoteFetchBlocked(), true, 'hata sonrası backoff aktif olmalı');

  resetRemoteFetchState();
  assert.equal(isRemoteFetchBlocked(), false, 'reset sonrası backoff kalkmalı');
});

test('markRemoteFetchSuccess backoff serisini sıfırlar', async () => {
  const {
    markRemoteFetchFailure,
    markRemoteFetchSuccess,
    isRemoteFetchBlocked,
    resetRemoteFetchState
  } = await import('../src/lib/remoteFetch.js');

  resetRemoteFetchState();
  markRemoteFetchFailure();
  markRemoteFetchSuccess();
  assert.equal(isRemoteFetchBlocked(), false, 'başarı sonrası backoff kalkmalı');
});

// /api/state dedup yalnızca GET için olmalı — POST (kaydet) yutulmamalı
test('dedup yalnızca GET /api/state için uygulanır (POST yutulmaz)', () => {
  const source = readFileSync(join(root, 'src/lib/remoteFetch.js'), 'utf8');
  assert.match(source, /function isDedupableStateRead/, 'GET-only dedup yardımcısı olmalı');
  assert.match(source, /method === 'GET'/, "dedup yalnızca GET metoduna sınırlı olmalı");
  assert.match(source, /export function resetRemoteFetchState/, 'reset fonksiyonu dışa açık olmalı');
});

// ---------------------------------------------------------------------------
// 2) Safe Mode istemci durumu
// ---------------------------------------------------------------------------
test('clearSafeModeState durumu sıfırlar ve dinleyiciyi tetikler', async () => {
  const {
    applySafeModeHeader,
    isSafeModeEnabled,
    subscribeSafeMode,
    clearSafeModeState,
    resetSafeModeClient
  } = await import('../src/lib/safeMode.js');

  resetSafeModeClient();

  applySafeModeHeader('on:degraded;poll=1;fsp=1;rt=1');
  assert.equal(isSafeModeEnabled(), true, 'header ile Safe Mode açılmalı');

  let notified = 0;
  const unsub = subscribeSafeMode(() => { notified += 1; });

  clearSafeModeState();
  assert.equal(isSafeModeEnabled(), false, 'clear sonrası Safe Mode kapanmalı');
  assert.equal(notified, 1, 'dinleyici bir kez tetiklenmeli (listener korunur)');

  unsub();
  resetSafeModeClient();
});

test('malformed x-safe-mode header app\u0027i bozmaz', async () => {
  const { applySafeModeHeader, isSafeModeEnabled, resetSafeModeClient } =
    await import('../src/lib/safeMode.js');

  resetSafeModeClient();
  assert.doesNotThrow(() => applySafeModeHeader('@@@garbage;;;==='));
  assert.equal(isSafeModeEnabled(), false, 'bozuk header Safe Mode açmamalı');
  assert.doesNotThrow(() => applySafeModeHeader(null));
  assert.doesNotThrow(() => applySafeModeHeader(undefined));
  resetSafeModeClient();
});

// ---------------------------------------------------------------------------
// 3) daily_claims tablosu eksik → geçici DB hatası DEĞİL, net kod
// ---------------------------------------------------------------------------
test('isUndefinedTableError 42P01 ve "relation does not exist" tespit eder', async () => {
  const { isUndefinedTableError, isTransientDbError } =
    await import('../api/_lib/dbTransient.js');

  const byCode = Object.assign(new Error('boom'), { code: '42P01' });
  const byMsg = new Error('relation "daily_claims" does not exist');

  assert.equal(isUndefinedTableError(byCode), true, '42P01 kodu tablo eksik sayılmalı');
  assert.equal(isUndefinedTableError(byMsg), true, 'mesaj eşleşmesi tablo eksik sayılmalı');
  assert.equal(isTransientDbError(byCode), false, 'tablo eksik geçici hata olmamalı (retry ile düzelmez)');
});

test('daily-claim handler tablo eksikse DAILY_CLAIMS_TABLE_MISSING döner', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/customerLoyaltyClaim.js'), 'utf8');
  assert.match(source, /isUndefinedTableError/, 'handler tablo eksik hatasını ayırt etmeli');
  assert.match(source, /DAILY_CLAIMS_TABLE_MISSING/, 'net kod dönmeli');
  assert.match(source, /status\(503\)/, 'tablo eksik 503 dönmeli (500 ham hata değil)');
  assert.match(source, /reportDailyClaimsTableMissing|recordIncident/, 'Guardian incident\u0027i üretmeli');
});

// ---------------------------------------------------------------------------
// 4) Logout temizliği — kaynak doğrulaması
// ---------------------------------------------------------------------------
// Belirli bir export fonksiyonunun gövdesini sonraki export'a kadar kes
function sliceFunction(source, name) {
  const start = source.indexOf(`export function ${name}`);
  if (start < 0) return '';
  const rest = source.slice(start + 1);
  const nextExport = rest.indexOf('\nexport function ');
  return nextExport < 0 ? source.slice(start) : source.slice(start, start + 1 + nextExport);
}

test('logoutSession ağ + Safe Mode durumunu sıfırlar ve kısa timeout kullanır', () => {
  const source = readFileSync(join(root, 'src/lib/session.js'), 'utf8');
  const body = sliceFunction(source, 'logoutSession');
  assert.match(body, /resetRemoteFetchState\(\)/, 'logout ağ durumunu sıfırlamalı');
  assert.match(body, /clearSafeModeState\(\)/, 'logout Safe Mode durumunu sıfırlamalı');
  assert.match(body, /timeoutMs:\s*4000/, 'sunucu logout 4sn timeout ile fire-and-forget olmalı');
});

test('applyAuthResult yeni oturumda ağ durumunu sıfırlar', () => {
  const source = readFileSync(join(root, 'src/lib/session.js'), 'utf8');
  const body = sliceFunction(source, 'applyAuthResult');
  assert.match(body, /resetRemoteFetchState\(\)/, 'login ağ durumunu temiz başlatmalı');
});
