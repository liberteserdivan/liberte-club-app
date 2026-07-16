import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanPhone, normalizePhone } from '../api/_lib/phone.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('05515992854 tüm formatlar aynı normalize değere düşer', () => {
  const expected = '5515992854';
  const variants = ['05515992854', '5515992854', '905515992854', '+905515992854'];
  for (const input of variants) {
    assert.equal(cleanPhone(input), expected);
    assert.equal(normalizePhone(input), expected);
  }
});

test('login ve register aynı cleanPhone helper kullanır', () => {
  const login = readFileSync(join(root, 'api/_lib/handlers/authLogin.js'), 'utf8');
  const register = readFileSync(join(root, 'api/_lib/handlers/authRegisterComplete.js'), 'utf8');
  assert.match(login, /cleanPhone/);
  assert.match(register, /cleanPhone/);
});

test('findCustomerByPhone yarım kayıt onarımı çağırır', () => {
  const store = readFileSync(join(root, 'api/_lib/customersStore.js'), 'utf8');
  assert.match(store, /repairIncompleteCustomer/);
});

test('register duplicate kaynağı loglanır', () => {
  const register = readFileSync(join(root, 'api/_lib/handlers/authRegisterComplete.js'), 'utf8');
  assert.match(register, /auth\.register-check/);
  assert.match(register, /duplicateSource/);
  assert.match(register, /inspectRegistrationConflict/);
});

test('login müşteri araması normalize tablo + onarım kullanır', () => {
  const auth = readFileSync(join(root, 'api/_lib/auth.js'), 'utf8');
  assert.match(auth, /repairIncompleteCustomer/);
  assert.match(auth, /customersStore\.js/);
});
