import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canAttempt, recordFailure, recordSuccess, resetCircuit } from '../src/lib/backgroundCircuit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// --- /api/state fail-fast + kontrollu 503 ---

test('state: okuma islemleri runSqlReadFast kullanir (raw/yavas path yok)', () => {
  const src = read('api/state.js');
  assert.match(src, /import \{ runSql, runSqlReadFast \}/, 'runSqlReadFast import edilmeli');
  assert.doesNotMatch(src, /\brunSqlRead\(/, 'eski yavas runSqlRead( kullanimi kalmamali');
});

test('state: gecici DB sorunu 503 STATE_TEMPORARILY_UNAVAILABLE doner (500 degil)', () => {
  const src = read('api/state.js');
  assert.match(src, /import \{ publicDbErrorCode, publicDbErrorMessage, isTransientDbError \}/);
  assert.match(src, /if \(isTransientDbError\(err\)\)/);
  assert.match(src, /status\(503\)[\s\S]*STATE_TEMPORARILY_UNAVAILABLE/);
});

test('state: auth yoksa DB state okumasi yapmadan 401 doner', () => {
  const src = read('api/state.js');
  // GET: getSessionForQr null ise 401 (loadAppState cagrilmadan once)
  const getIdx = src.indexOf('getSessionForQr(req)');
  const guardIdx = src.indexOf("status(401).json({ error: 'Oturum gerekli' })");
  const loadIdx = src.indexOf('loadAppStateForCustomer(session.customerId');
  assert.ok(getIdx !== -1 && guardIdx !== -1 && loadIdx !== -1);
  assert.ok(guardIdx < loadIdx, '401 guard state okumasindan once olmali');
});

test('state: Guardian hydrate yok (kritik okuma yolu)', () => {
  const src = read('api/state.js');
  assert.match(src, /withSqlRequestNoGuardian/);
  assert.doesNotMatch(src, /withSqlRequest\(/);
});

test('qr: Guardian hydrate yok (musteri QR yolu)', () => {
  const src = read('api/qr.js');
  assert.match(src, /withSqlRequestNoGuardian/);
});

test('guardian: cift hydrate yok', () => {
  const src = read('api/guardian.js');
  assert.match(src, /withSqlRequestNoGuardian/);
});

test('state: customer yolu admin tam state degil, customer slice yukler', () => {
  const src = read('api/state.js');
  // GET salt-okuma: isFullAdmin degilse loadAppStateForCustomer kullanilir.
  // Yazma yan etkisi olmamasi icin her iki dal da skipPersist:true ile cagrilir.
  assert.match(
    src,
    /isFullAdmin\s*\?\s*loadAppState\(\{ skipPersist: true \}\)\s*:\s*loadAppStateForCustomer\(session\.customerId, \{ skipPersist: true \}\)/
  );
});

// --- daily-claim kapalı ---

test('daily-claim: özellik kapalı DAILY_CLAIM_DISABLED', () => {
  const src = read('api/_lib/handlers/customerLoyaltyClaim.js');
  assert.match(src, /DAILY_CLAIM_DISABLED/);
  assert.match(src, /status\(410\)/);
  assert.doesNotMatch(src, /applyDailyLoginRewardRelational/);
});

test('daily-claim: auth requireSession ile (oturum yoksa hizli 401)', () => {
  const src = read('api/_lib/handlers/customerLoyaltyClaim.js');
  assert.match(src, /requireSession\(req, res\)/);
  assert.ok(
    src.indexOf('requireSession(req, res)') < src.indexOf('status(410)'),
    'auth kontrolu disabled yanıttan once olmali'
  );
});

// --- admin members retry storm: dedup + circuit breaker ---

test('useAdminMembers: in-flight dedup + circuit breaker entegre', () => {
  const src = read('src/hooks/useAdminMembers.js');
  // Invariant: eşzamanlı non-manual pull tek promise'e iner; circuit breaker bağlıdır.
  assert.match(src, /inFlightRef\s*=\s*useRef\(\s*null\s*\)/, 'in-flight ref olmali');
  assert.match(
    src,
    /(?:else\s+)?if\s*\(\s*inFlightRef\.current\s*\)\s*\{?\s*return\s+inFlightRef\.current/,
    'es zamanli istek tek isteğe inmeli'
  );
  assert.match(src, /canAttempt\(ADMIN_MEMBERS_CIRCUIT\)/, 'devre kesici kontrolu olmali');
  assert.match(src, /recordFailure\(ADMIN_MEMBERS_CIRCUIT\)/, 'hata devre sayacini artirmali');
  assert.match(src, /recordSuccess\(ADMIN_MEMBERS_CIRCUIT\)/, 'basari devreyi sifirlamali');
});

test('adminMemberClient: native icin ADMIN_MEMBERS_REQUEST_OPTIONS kullanir', () => {
  const src = read('src/lib/adminMemberClient.js');
  // Timeout ayari fetchAdminMembersPage icinde; list wrapper sayfalar� cagirir
  const start = src.indexOf('async function fetchAdminMembersPage');
  const end = src.indexOf('export async function applyAdminMemberLoyalty');
  const fn = src.slice(start, end);
  assert.match(fn, /ADMIN_MEMBERS_REQUEST_OPTIONS/, 'admin members native uzun timeout kullanmali');
  assert.doesNotMatch(fn, /timeoutMs:\s*60000/, '60sn sabit timeout kaldirilmali');
  assert.match(fn, /fetchAdminMembersPage/, 'keyset sayfa cekimi olmali');
});

// Davranissal: devre 3 hatadan sonra acilir, 60sn skip eder, basari sifirlar
test('backgroundCircuit: admin-members 3 hata sonrasi 60sn skip eder', () => {
  const key = 'test-admin-members-storm';
  resetCircuit(key);
  assert.equal(canAttempt(key), true);
  recordFailure(key);
  recordFailure(key);
  assert.equal(canAttempt(key), true, '2 hata sonrasi hala denenebilir');
  recordFailure(key); // 3. hata -> devre acilir
  assert.equal(canAttempt(key), false, '3 hata sonrasi devre acik (skip)');
  recordSuccess(key);
  assert.equal(canAttempt(key), true, 'basari devreyi sifirlar');
  resetCircuit(key);
});
