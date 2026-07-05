import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// 1) authEpoch (sessionGeneration) — oturum değişiminde nesil ilerler
test('session.js authEpoch sağlar ve login/logout geçişlerinde ilerletir', () => {
  const src = read('src/lib/session.js');
  assert.match(src, /export .*getAuthEpoch/, 'getAuthEpoch export edilmeli');
  assert.match(src, /function bumpAuthEpoch\(\)/, 'bumpAuthEpoch tanımlı olmalı');
  // logoutSession ve applyAuthResult içinde nesil ilerlemeli
  const logout = src.slice(src.indexOf('export function logoutSession'), src.indexOf('export function readSession'));
  assert.match(logout, /bumpAuthEpoch\(\)/, 'logout authEpoch ilerletmeli');
  const apply = src.slice(src.indexOf('export function applyAuthResult'), src.indexOf('export function logoutSession'));
  assert.match(apply, /bumpAuthEpoch\(\)/, 'login (applyAuthResult) authEpoch ilerletmeli');
});

// 2) useCommit — eski /api/state yanıtı yeni auth state'i ezmesin
test('useCommit pullRemote epoch guard ile stale yanıtı yok sayar', () => {
  const src = read('src/hooks/useCommit.js');
  assert.match(src, /getAuthEpoch/, 'useCommit getAuthEpoch kullanmalı');
  assert.match(src, /const epochAtStart = getAuthEpoch\(\)/, 'istek başında epoch yakalanmalı');
  assert.match(src, /isStaleAuth/, 'stale-auth guard fonksiyonu olmalı');
  // setDb'den önce stale kontrolü yapılmalı
  const idx = src.indexOf('lastRemoteAt.current = remote.updatedAt;');
  const before = src.slice(0, idx);
  assert.match(before.slice(-220), /isStaleAuth\(\)\)\s*return;/, 'setDb öncesi stale guard olmalı');
});

// 3) useAdminMembers — eski admin-customers yanıtı yeni state'i ezmesin
test('useAdminMembers admin-customers için epoch guard içerir', () => {
  const src = read('src/hooks/useAdminMembers.js');
  assert.match(src, /getAuthEpoch/, 'useAdminMembers getAuthEpoch kullanmalı');
  assert.match(src, /const epochAtStart = getAuthEpoch\(\)/, 'istek başında epoch yakalanmalı');
  assert.match(src, /getAuthEpoch\(\) !== epochAtStart/, 'yanıt sonrası epoch karşılaştırması olmalı');
});

// 4) VITE_DISABLE_REALTIME — tüm realtime kaynaklarını kapatan sert anahtar
test('safeMode isRealtimeDisabledByFlag export eder ve customer realtime bunu kullanır', () => {
  const src = read('src/lib/safeMode.js');
  assert.match(src, /export function isRealtimeDisabledByFlag\(\)/, 'flag fonksiyonu export edilmeli');
  assert.match(src, /VITE_DISABLE_REALTIME/, 'flag VITE_DISABLE_REALTIME okumalı');
  const customer = src.slice(src.indexOf('export function isCustomerRealtimeDisabled'));
  assert.match(customer, /isRealtimeDisabledByFlag\(\)/, 'customer realtime flag\'i kullanmalı');
});

// 5) realtimeFetch — bayrak açıkken hiçbir /api/realtime isteği gönderilmez (admin dahil)
test('realtimeFetch bayrak açıkken customer + admin + admin-customers isteklerini kısa devre yapar', () => {
  const src = read('src/lib/realtimeFetch.js');
  assert.match(src, /import \{ isRealtimeDisabledByFlag \} from '\.\/safeMode\.js'/, 'flag import edilmeli');
  // safeRealtimeRequest (customer) başında flag guard
  const safe = src.slice(src.indexOf('async function safeRealtimeRequest'));
  assert.match(safe.slice(0, 300), /isRealtimeDisabledByFlag\(\)/, 'customer realtime flag ile kısa devre yapmalı');
  // admin feed ve admin-customers da kapanmalı
  const feed = src.slice(src.indexOf('export async function fetchAdminFeed'));
  assert.match(feed.slice(0, 200), /isRealtimeDisabledByFlag\(\)/, 'admin feed flag ile kapanmalı');
  const customers = src.slice(src.indexOf('export async function fetchAdminCustomersStrict'));
  assert.match(customers.slice(0, 250), /isRealtimeDisabledByFlag\(\)/, 'admin-customers flag ile kapanmalı');
});

// 6) App.jsx — login ekranında background 401 UI'ı bozmaz, admin realtime flag'e tabi
test('App.jsx onUnauthorized oturum yokken erken döner (login ekranı 401\'den etkilenmez)', () => {
  const src = read('src/App.jsx');
  const handler = src.slice(src.indexOf('setUnauthorizedHandler((reason)'), src.indexOf('return () => setUnauthorizedHandler(null)'));
  assert.match(handler, /if \(!getMemorySession\(\)\) return;/, 'oturum yoksa 401 erken dönmeli');
});

test('App.jsx useAdminRealtime VITE_DISABLE_REALTIME ile kapanır', () => {
  const src = read('src/App.jsx');
  const start = src.indexOf('useAdminRealtime({');
  const block = src.slice(start, start + 250);
  assert.match(block, /!isRealtimeDisabledByFlag\(\)/, 'admin realtime flag\'e tabi olmalı');
});

test('App.jsx sessionRef render sırasında senkron güncellenir (logout race önlemi)', () => {
  const src = read('src/App.jsx');
  // useCommit çağrısından ÖNCE sessionRef.current = session olmalı
  const refIdx = src.indexOf('sessionRef.current = session;');
  const commitIdx = src.indexOf('= useCommit(load()');
  assert.ok(refIdx !== -1, 'sessionRef.current = session render gövdesinde olmalı');
  assert.ok(refIdx < commitIdx, 'sessionRef güncellemesi useCommit çağrısından önce olmalı');
  // Eski effect tabanlı güncelleme kaldırılmış olmalı
  assert.doesNotMatch(src, /useEffect\(\(\) => \{\s*sessionRef\.current = session;\s*\}, \[session\]\)/);
});
