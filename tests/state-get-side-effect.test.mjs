import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSqlRetry, isTransientDbError } from '../api/_lib/dbTransient.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appStateSrc = readFileSync(join(root, 'api/_lib/appState.js'), 'utf8');
const stateSrc = readFileSync(join(root, 'api/state.js'), 'utf8');

// loadAppState gövdesini izole et — yalnızca okuma fonksiyonunu denetle
function loadAppStateBody(source) {
  const start = source.indexOf('export async function loadAppState(');
  const next = source.indexOf('export async function loadAppStateForCustomer(', start);
  return source.slice(start, next);
}

test('GET full-admin legacy yolu skipPersist ile loadAppState çağırır (yazma yok)', () => {
  // GET tam-admin okuması saveAppState tetiklememeli: skipPersist:true geçilir
  assert.match(stateSrc, /loadAppState\(\{\s*skipPersist:\s*true\s*\}\)/);
});

test('GET müşteri yolu da skipPersist ile çağrılır', () => {
  assert.match(
    stateSrc,
    /loadAppStateForCustomer\(session\.customerId,\s*\{\s*skipPersist:\s*true\s*\}\)/
  );
});

test('loadAppState seed dalı skipPersist modunda saveAppState çağırmaz', () => {
  const body = loadAppStateBody(appStateSrc);
  const seedStart = body.indexOf('if (!data) {');
  const seedEnd = body.indexOf('const synced = applyMenuSync');
  const seedBlock = body.slice(seedStart, seedEnd);

  // skipPersist erken dönüşü saveAppState'ten ÖNCE gelmeli
  const guardIdx = seedBlock.indexOf('if (skipPersist)');
  const saveIdx = seedBlock.indexOf('await saveAppState(data)');
  assert.ok(guardIdx > -1, 'seed dalında skipPersist koruması bulunmalı');
  assert.ok(saveIdx > -1, 'seed dalı normal modda hâlâ saveAppState çağırmalı');
  assert.ok(guardIdx < saveIdx, 'skipPersist koruması saveAppState öncesinde olmalı');

  // skipPersist guard'ı kalıcılaştırma yapmadan döner
  assert.match(seedBlock, /if \(skipPersist\) \{[\s\S]*?return \{ data, updatedAt: null \};[\s\S]*?\}/);
});

test('loadAppState menu/loyalty migration kalıcılaştırması skipPersist ile atlanır', () => {
  const body = loadAppStateBody(appStateSrc);
  // Migration sonrası yazım yalnızca skipPersist false iken yapılır
  assert.match(body, /if \(!skipPersist && \(synced\.changed \|\| loyaltyChanged\)\) \{/);
});

test('GET seed/migrated state hesaplanıp kalıcılaştırılmadan döndürülebilir', () => {
  const body = loadAppStateBody(appStateSrc);
  // Hesaplanan state her durumda döner; skipPersist yalnızca yazımı engeller
  assert.match(body, /return \{ data, updatedAt \};/);
  assert.match(body, /return \{ data, updatedAt: null \};/);
});

test('POST/state yazımı hâlâ runSql ile saveAppState çağırır (write değişmedi)', () => {
  // Admin tam state yazımı ve müşteri merge yazımı korunur
  assert.match(stateSrc, /runSql\(\(\) => saveAppState\(mergeAdminState\(canonical, data\)\)\)/);
  assert.match(stateSrc, /runSql\(\(\) => saveAppState\(merged\)\)/);
});

test('Read timeout ETIMEDOUT olarak transient sınıflanır → kontrollü 503', async () => {
  // Asla çözülmeyen okuma — fail-fast timeout fırlatır
  const hung = () => new Promise(() => {});
  await assert.rejects(
    withSqlRetry(hung, { retries: 0, attemptTimeoutMs: 30 }),
    (err) => {
      // Timeout hatası geçici sayılmalı ki state.js 503 (500 değil) dönsün
      assert.ok(isTransientDbError(err), 'ETIMEDOUT transient olmalı');
      return /ETIMEDOUT/.test(String(err.message));
    }
  );
});

test('state.js geçici DB hatasında 503 döner (ham 500 değil)', () => {
  assert.match(stateSrc, /if \(isTransientDbError\(err\)\) \{[\s\S]*?status\(503\)/);
});

test('GET dalında saveAppState çağrılmaz (salt-okuma)', () => {
  const getStart = stateSrc.indexOf("if (req.method === 'GET')");
  const postStart = stateSrc.indexOf("if (req.method === 'POST')");
  const getBlock = stateSrc.slice(getStart, postStart);
  assert.doesNotMatch(getBlock, /await saveAppState|runSql\(\(\) => saveAppState/, 'GET içinde kalıcı yazım olmamalı');
  assert.match(getBlock, /loadAppState\(\{ skipPersist: true \}\)/);
});
