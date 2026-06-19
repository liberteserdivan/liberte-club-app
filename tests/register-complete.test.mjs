import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('register-complete kritik yolda loadAppState/saveAppState await etmez', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/authRegisterComplete.js'), 'utf8');
  assert.doesNotMatch(source, /await loadAppState/);
  assert.doesNotMatch(source, /await saveAppState/);
  assert.match(source, /queueRegisterAppStateSync/);
});

test('register-complete email kodu müşteri bulmadan önce doğrulanır', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/authRegisterComplete.js'), 'utf8');
  const verifyIdx = source.indexOf('verifyEmailCode');
  const findIdx = source.indexOf('resolveRegistrationDuplicate');
  assert.ok(verifyIdx >= 0 && findIdx >= 0);
  assert.ok(verifyIdx < findIdx, 'verify_code customer_find öncesinde olmalı');
});

test('register-complete PIN ve session transaction içinde', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/authRegisterComplete.js'), 'utf8');
  assert.match(source, /sql\.begin/);
  assert.match(source, /saveCustomerPin\(tx/);
  assert.match(source, /createSession\(res,\s*\{[\s\S]*sql:\s*tx/);
});

test('register-complete step süreleri loglanır', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/authRegisterComplete.js'), 'utf8');
  assert.match(source, /markStep\('verify_code'\)/);
  assert.match(source, /successTimings\(\)/);
});

test('customersStore admin yetkisi customers.is_admin ile tutulur', () => {
  const source = readFileSync(join(root, 'api/_lib/customersStore.js'), 'utf8');
  assert.match(source, /grantAdminByPhone/);
  assert.match(source, /is_admin/);
});

test('auth müşteri araması önce normalize tablo kullanır', () => {
  const source = readFileSync(join(root, 'api/_lib/auth.js'), 'utf8');
  assert.match(source, /customersStore\.js/);
});

test('LoginPage kayıt sonrası uzak kayıt atlar', () => {
  const source = readFileSync(join(root, 'src/pages/LoginPage.jsx'), 'utf8');
  assert.match(source, /skipRemote:\s*true/);
});

test('sql pool globalThis önbelleği kullanır', () => {
  const source = readFileSync(join(root, 'api/_lib/sql.js'), 'utf8');
  assert.match(source, /globalThis\[GLOBAL_SQL_KEY\]/);
});
