import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPin } from '../api/_lib/pinAuth.js';
import { resolveQrSigningSecret } from '../api/_lib/qrToken.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// B-1: pbkdf2 asenkron
test('B-1: hashPin asenkron (Promise) ve gecerli salt/hash uretir', async () => {
  const result = await hashPin('1234');
  assert.ok(result.salt && typeof result.salt === 'string');
  assert.ok(result.hash && typeof result.hash === 'string');
  assert.equal(result.hash.length, 128); // 64 byte -> 128 hex
});

test('B-1: pinAuth artik pbkdf2Sync kullanmiyor', () => {
  const src = read('api/_lib/pinAuth.js');
  // Senkron cagri (pbkdf2Sync(...)) kalmamali; yorumdaki kelime haric
  assert.doesNotMatch(src, /pbkdf2Sync\(/);
  assert.match(src, /promisify\(pbkdf2\)/);
});

// RB-2: uretimde ADMIN_PIN turetmesi kullanilmaz
test('RB-2: production + ADMIN_PIN var ama QR_SIGNING_SECRET yok -> missing', () => {
  const prev = { ...process.env };
  delete process.env.QR_SIGNING_SECRET;
  process.env.ADMIN_PIN = '1234';
  process.env.VERCEL_ENV = 'production';

  const result = resolveQrSigningSecret();
  assert.equal(result.source, 'missing');
  assert.equal(result.secret, null);

  process.env = prev;
});

test('RB-2: uretim disinda ADMIN_PIN turetmesi calisir', () => {
  const prev = { ...process.env };
  delete process.env.QR_SIGNING_SECRET;
  process.env.ADMIN_PIN = '1234';
  process.env.VERCEL_ENV = 'development';
  process.env.NODE_ENV = 'development';

  const result = resolveQrSigningSecret();
  assert.equal(result.source, 'ADMIN_PIN_DERIVED');
  assert.ok(result.secret);

  process.env = prev;
});

// B-4: atomik rate-limit sayaci
test('B-4: rateLimit tek atomik INSERT ON CONFLICT RETURNING kullanir', () => {
  const src = read('api/_lib/rateLimit.js');
  assert.match(src, /INSERT INTO auth_rate_limits[\s\S]*ON CONFLICT \(rate_key\) DO UPDATE[\s\S]*RETURNING hit_count/);
  assert.match(src, /hit_count \|\| 0\) > maxHits/);
});

// B-2: login rate-limit retry disinda
test('B-2: handleAuthLogin rate-limit kontrolu retry disinda', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  // runSqlLoginRead'dan ONCE enforceAuthRateLimit cagrilmali
  const rlIdx = src.indexOf("isLoginRateLimited(req, 'auth_login'");
  const retryIdx = src.indexOf('runSqlLoginRead(');
  assert.ok(rlIdx > 0 && retryIdx > 0 && rlIdx < retryIdx, 'rate-limit retry oncesi olmali');
  // resolveLoginOutcome icinde artik enforceAuthRateLimit cagrisi olmamali
  const resolveStart = src.indexOf('async function resolveLoginOutcome');
  assert.ok(src.indexOf('enforceAuthRateLimit', resolveStart) === -1);
});

// O-3: ham hata maskeleme
test('O-3: push/realtime handler ham error.message dondurmuyor', () => {
  const push = read('api/_lib/handlers/pushRegisterDevice.js');
  assert.match(push, /publicDbErrorMessage\(error/);
  assert.doesNotMatch(push, /error\?\.message \|\| 'Cihaz kaydı tamamlanamadı'/);

  const realtime = read('api/_lib/handlers/realtimeFetch.js');
  assert.match(realtime, /publicDbErrorMessage\(error/);
  assert.doesNotMatch(realtime, /error\?\.message \|\| 'Realtime fetch başarısız'/);
});

// LP 3.2: gunluk claim bump best-effort
test('LP 3.2: customerRewards bumpAppStateRevision try/catch ile sarili', () => {
  const src = read('api/_lib/customerRewards.js');
  assert.match(src, /try \{\s*await bumpAppStateRevision\(sql\);\s*invalidateAppStateCache\(\);\s*\} catch/);
});
