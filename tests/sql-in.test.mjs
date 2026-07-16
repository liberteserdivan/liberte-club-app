import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('sqlIn — ANY yerine IN kullanilir (pooler uyumu)', () => {
  const pinAuth = readFileSync(join(root, 'api/_lib/pinAuth.js'), 'utf8');
  const customers = readFileSync(join(root, 'api/_lib/customersStore.js'), 'utf8');
  const emails = readFileSync(join(root, 'api/_lib/customerEmails.js'), 'utf8');

  assert.ok(!pinAuth.includes('ANY(${variants})'), 'pinAuth ANY kaldirilmali');
  assert.ok(pinAuth.includes('inList(sql, variants)'), 'pinAuth inList kullanmali');
  assert.ok(customers.includes('inList(sql, variants)'), 'customersStore inList kullanmali');
  assert.ok(emails.includes('inList(sql, variants)'), 'customerEmails inList kullanmali');
});

test('sqlIn modulu export eder', async () => {
  const { inList } = await import('../api/_lib/sqlIn.js');
  assert.equal(typeof inList, 'function');
});
