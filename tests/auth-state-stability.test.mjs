import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// 1) Login success olduktan sonra handler 500 fırlatamaz
test('authLogin: oturum oluştuktan sonra body hatası 200 plain body döner (500 değil)', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  assert.match(src, /function buildPlainLoginBody/, 'minimal başarı gövdesi üreteci olmalı');

  // Başarı yolu: createSession ÇAĞRISINDAN SONRA body try/catch ile sarılı olmalı
  const createIdx = src.indexOf('createSession(res');
  const successCatchIdx = src.indexOf('success_body_failed');
  assert.ok(createIdx !== -1, 'createSession çağrısı bulunmalı');
  assert.ok(successCatchIdx !== -1, 'success_body_failed fallback olmalı');
  assert.ok(createIdx < successCatchIdx, 'body fallback createSession sonrası olmalı');

  // Hata durumunda 200 plain body
  const tail = src.slice(successCatchIdx);
  assert.match(tail.slice(0, 200), /buildPlainLoginBody/, 'success body hatasında plain body kullanılmalı');

  // reuse yolu da korunmalı
  assert.match(src, /reuse_body_failed/, 'reuse body hatası da yakalanmalı');
});

// Sadakat sorgusu non-fatal olmalı (login'i bloklamaz)
test('authLogin: sadakat sorgusu non-fatal (try/catch ile loyalty null)', () => {
  const src = read('api/_lib/handlers/authLogin.js');
  const fnStart = src.indexOf('async function buildLoginSuccessBody');
  const fnEnd = src.indexOf('async function handleAuthLogin');
  const body = src.slice(fnStart, fnEnd);
  assert.match(body, /try\s*\{[\s\S]*findLoyaltyByCustomerId[\s\S]*\}\s*catch/, 'loyalty fetch try/catch içinde olmalı');
});

// 2/3/4) Session okuması fail-fast — 32sn retry yığını kaldırıldı
test('runSql: runSqlReadFast kısa timeout + az deneme ile tanımlı', () => {
  const src = read('api/_lib/runSql.js');
  assert.match(src, /export function runSqlReadFast/, 'runSqlReadFast export edilmeli');
  assert.match(src, /SESSION_READ_ATTEMPT_TIMEOUT_MS\s*=\s*3000/, 'session okuma timeout 3sn olmalı');
  assert.match(src, /isSqlRequestActive\(\)\s*\?\s*1\s*:\s*2/, 'fail-fast az retry (1/2) olmalı');
});

test('auth: getSession/getSessionForBootstrap/getSessionForQr fail-fast okuma kullanır', () => {
  const src = read('api/_lib/auth.js');
  assert.match(src, /import \{ runSql, runSqlRead, runSqlReadFast \}/, 'runSqlReadFast import edilmeli');
  // Üç oturum getter'ı da fail-fast okuma kullanmalı
  const count = (src.match(/runSqlReadFast\(async \(\) =>/g) || []).length;
  assert.ok(count >= 3, `en az 3 session getter runSqlReadFast kullanmalı (bulunan: ${count})`);
});

// 3) /api/state cookie/token yoksa DB'ye gitmeden hızlı 401 döner
test('auth: token yoksa session getter DB\'ye gitmeden null döner', () => {
  const src = read('api/_lib/auth.js');
  // getSessionForBootstrap: token yoksa runSqlReadFast'ten ÖNCE return null
  const fnStart = src.indexOf('export async function getSessionForBootstrap');
  const body = src.slice(fnStart, fnStart + 400);
  const tokenGuardIdx = body.indexOf('if (!token) return null;');
  const sqlIdx = body.indexOf('runSqlReadFast');
  assert.ok(tokenGuardIdx !== -1, 'token yokluk guard olmalı');
  assert.ok(sqlIdx !== -1 && tokenGuardIdx < sqlIdx, 'token guard DB okumasından önce olmalı');
});

// 1/6) Duplicate login submit tek request'e düşer
test('LoginPage: duplicate login submit in-flight guard ile engellenir', () => {
  const src = read('src/pages/LoginPage.jsx');
  assert.match(src, /loginInFlightRef\s*=\s*useRef\(false\)/, 'in-flight ref olmalı');
  assert.match(src, /if \(loginInFlightRef\.current\) return;/, 'uçuştaki giriş varken erken dönmeli');
  assert.match(src, /loginInFlightRef\.current = true;/, 'guard set edilmeli');
  assert.match(src, /loginInFlightRef\.current = false;/, 'finally guard sıfırlanmalı');
});

// 5) Background /api/state 401 kullanıcıyı logout/login döngüsüne sokmaz
test('App: oturum yokken background 401 logout/login döngüsü tetiklemez', () => {
  const src = read('src/App.jsx');
  const handler = src.slice(src.indexOf('setUnauthorizedHandler((reason)'), src.indexOf('return () => setUnauthorizedHandler(null)'));
  assert.match(handler, /if \(!getMemorySession\(\)\) return;/, 'oturum yoksa 401 erken dönmeli');
});
