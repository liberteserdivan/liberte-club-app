import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkArray } from '../api/_lib/chunk.js';
import { enforceAuthRateLimit } from '../api/_lib/rateLimit.js';
import { handleGuardian } from '../api/_lib/handlers/guardian.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// Basit yanıt sahtesi — status().json() yakalar
function makeRes() {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  res.end = () => res;
  res.setHeader = () => {};
  return res;
}

// RB-3: chunkArray davranışı
test('RB-3: chunkArray bos dizide bos dondurur', () => {
  assert.deepEqual(chunkArray([], 500), []);
});

test('RB-3: chunkArray tek parca (size altinda) dondurur', () => {
  assert.deepEqual(chunkArray([1, 2, 3], 500), [[1, 2, 3]]);
});

test('RB-3: chunkArray buyuk diziyi 500luk parcalara boler', () => {
  const big = Array.from({ length: 1250 }, (_, i) => i);
  const chunks = chunkArray(big, 500);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 500);
  assert.equal(chunks[1].length, 500);
  assert.equal(chunks[2].length, 250);
  assert.equal(chunks.flat().length, 1250);
});

test('RB-3: toplu upsertler chunkArray kullanir', () => {
  const src = read('api/_lib/customersStore.js');
  assert.match(src, /chunkArray\(list, BULK_UPSERT_CHUNK\)/);
  const emails = read('api/_lib/customerEmails.js');
  assert.match(emails, /chunkArray\(rows, 500\)/);
});

// B-3: telefon bazlı rate-limit
test('B-3: enforceAuthRateLimit identifier kabul eder (DB yokken false)', async () => {
  // Test ortaminda getSql null -> isRateLimited false; cagri hata firlatmamali
  const limited = await enforceAuthRateLimit({ headers: {} }, 'auth_login', {
    maxHits: 15,
    identifier: '5551112233'
  });
  assert.equal(limited, false);
});

test('B-3: login telefon bazli + gevsek IP limiti kullanir', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /identifier: loginPhone/);
  assert.match(src, /'auth_login_ip'/);
});

test('B-3: enforceAuthRateLimit identifier ile kimlik bazli anahtar uretir', () => {
  const src = read('api/_lib/rateLimit.js');
  assert.match(src, /\$\{action\}:id:\$\{id\}/);
});

// Bot cron: CRON_SECRET olmadan yetkisiz
test('Bot cron: CRON_SECRET yokken 401 doner', async () => {
  const prev = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;

  const req = { method: 'GET', query: { resource: 'cron' }, headers: {}, url: '/api/guardian/cron' };
  const res = makeRes();
  await handleGuardian(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.service, 'cron');

  if (prev !== undefined) process.env.CRON_SECRET = prev;
});

test('Bot cron: vercel.json cron ve rewrite icerir', () => {
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(Array.isArray(vercel.crons), 'crons dizisi olmali');
  assert.ok(vercel.crons.some((c) => c.path === '/api/guardian/cron'));
  assert.ok(vercel.rewrites.some((r) => r.source === '/api/guardian/cron'));
});
