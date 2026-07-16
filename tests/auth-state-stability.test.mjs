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
  const createIdx = src.indexOf('createSessionOnce(res');
  const successCatchIdx = src.indexOf('complete_ok');
  assert.ok(createIdx !== -1, 'createSessionOnce çağrısı bulunmalı');
  assert.ok(successCatchIdx !== -1, 'complete_ok log olmalı');
  assert.ok(createIdx < successCatchIdx, 'body fallback createSessionOnce sonrası olmalı');

  const tail = src.slice(src.indexOf('let bodyOk', createIdx));
  assert.match(tail.slice(0, 400), /buildPlainLoginBody/, 'success body hatasında plain body kullanılmalı');

  // reuse yolu da korunmalı
  assert.match(src, /outcome\.kind === 'reuse'[\s\S]*buildPlainLoginBody/, 'reuse body hatasında plain body kullanılmalı');
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
  assert.match(src, /import \{ runSql, runSqlReadFast, runSqlSessionBootstrap, runSqlSessionDelete \}/, 'runSqlSessionBootstrap import edilmeli');
  // Üç oturum getter'ı da fail-fast okuma kullanmalı
  const count = (src.match(/runSqlReadFast\(async \(\) =>/g) || []).length;
  assert.ok(count >= 2, `getSession/getSessionForQr runSqlReadFast kullanmalı (bulunan: ${count})`);
  assert.match(src, /runSqlSessionBootstrap\(async \(\) =>/, 'getSessionForBootstrap runSqlSessionBootstrap kullanmalı');
});

// 3) /api/state cookie/token yoksa DB'ye gitmeden hızlı 401 döner
test('auth: token yoksa session getter DB\'ye gitmeden null döner', () => {
  const src = read('api/_lib/auth.js');
  // getSessionForBootstrap: token yoksa runSqlReadFast'ten ÖNCE return null
  const fnStart = src.indexOf('export async function getSessionForBootstrap');
  const body = src.slice(fnStart, fnStart + 400);
  const tokenGuardIdx = body.indexOf('if (!token) return null;');
  const sqlIdx = body.indexOf('runSqlSessionBootstrap');
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

// 6) Hızlı login/logout — çıkışta React db sıfırlanır, stale commit engellenir
test('useCommit: resetDb bellek state\'ini seed\'e döndürür', () => {
  const src = read('src/hooks/useCommit.js');
  assert.match(src, /const resetDb = useCallback/, 'resetDb tanımlı olmalı');
  assert.match(src, /setDb\(load\(\)\)/, 'resetDb load() ile seed döndürmeli');
});

test('App.jsx logout resetDb çağırır', () => {
  const src = read('src/App.jsx');
  const logout = src.slice(src.indexOf('function handleSetSession'), src.indexOf('const customer = session'));
  assert.match(logout, /resetDb\(\)/, 'resetDb logout ile çağrılmalı');
});

test('pushPrompt: deactivateDevicePushToken commit kullanmaz', () => {
  const src = read('src/lib/pushPrompt.js');
  const fn = src.slice(src.indexOf('export async function deactivateDevicePushToken'));
  assert.doesNotMatch(fn.slice(0, 600), /\bcommit\s*\(/, 'logout push commit yapmamalı');
});

test('LoginPage: uçuştaki login çıkış sonrası oturumu geri açmaz', () => {
  const src = read('src/pages/LoginPage.jsx');
  assert.match(src, /epochAtLogin/, 'login epoch guard olmalı');
  assert.match(src, /getAuthEpoch\(\) !== epochAtLogin/, 'finishSession stale login yoksaymalı');
});

test('session bootstrap: geç gelen yanıt login sonrası oturumu silmez', () => {
  const src = read('src/lib/session.js');
  assert.match(src, /authChangedDuringBootstrap/, 'bootstrap epoch guard olmalı');
  const bootstrapBlock = src.slice(src.indexOf('export async function bootstrapSession'), src.indexOf('export async function hydrateSessionTokenFromServer'));
  assert.doesNotMatch(bootstrapBlock, /bumpAuthEpoch\(\)/, 'bootstrapSession bumpAuthEpoch cagirmamali');
});

test('App bootstrap: canlı oturum varken geç bootstrap UI ezmez', () => {
  const src = read('src/App.jsx');
  const block = src.slice(src.indexOf('bootstrapSessionWithTimeout'), src.indexOf('}, []);', src.indexOf('bootstrapSessionWithTimeout')) + 6);
  assert.match(block, /const live = getMemorySession\(\)/, 'canlı oturum kontrolü olmalı');
  assert.match(block, /if \(live\)/, 'canlı oturum varsa öncelik verilmeli');
});
