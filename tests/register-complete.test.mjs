import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('register-complete kayıt finalinde jsonb patch kullanır', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/authRegisterComplete.js'), 'utf8');
  assert.match(source, /patchAppStateRegistration/);
});

test('register-complete email kodu state yüklemeden önce doğrulanır', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/authRegisterComplete.js'), 'utf8');
  const verifyIdx = source.indexOf("trace.log('verify_code'");
  const loadIdx = source.indexOf("trace.log('load_app_state'");
  assert.ok(verifyIdx >= 0 && loadIdx >= 0);
  assert.ok(verifyIdx < loadIdx, 'verify_code load_app_state öncesinde olmalı');
});

test('register-complete PIN ve session transaction içinde', () => {
  const source = readFileSync(join(root, 'api/_lib/handlers/authRegisterComplete.js'), 'utf8');
  assert.match(source, /sql\.begin/);
  assert.match(source, /saveCustomerPin\(tx/);
  assert.match(source, /createSession\(res,\s*\{[\s\S]*sql:\s*tx/);
});

test('sql pool globalThis önbelleği kullanır', () => {
  const source = readFileSync(join(root, 'api/_lib/sql.js'), 'utf8');
  assert.match(source, /globalThis\[GLOBAL_SQL_KEY\]/);
});

test('LoginPage kayıt hatasında requestId gösterir', () => {
  const source = readFileSync(join(root, 'src/pages/LoginPage.jsx'), 'utf8');
  assert.match(source, /readApiError/);
  assert.match(source, /requestId/);
});
