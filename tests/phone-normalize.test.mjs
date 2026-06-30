import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPhone, normalizePhone, phoneLookupVariants, isValidTrMobilePhone } from '../api/_lib/phone.js';

test('cleanPhone 05058665406 -> 5058665406', () => {
  assert.equal(cleanPhone('05058665406'), '5058665406');
});

test('cleanPhone +905058665406 -> 5058665406', () => {
  assert.equal(cleanPhone('+905058665406'), '5058665406');
});

test('cleanPhone 905058665406 -> 5058665406', () => {
  assert.equal(cleanPhone('905058665406'), '5058665406');
});

test('cleanPhone 5058665406 aynı kalır', () => {
  assert.equal(cleanPhone('5058665406'), '5058665406');
});

test('normalizePhone cleanPhone alias', () => {
  assert.equal(normalizePhone('0505 866 54 06'), '5058665406');
});

test('phoneLookupVariants eski formatları içerir', () => {
  const variants = phoneLookupVariants('05058665406');
  assert.ok(variants.includes('5058665406'));
  assert.ok(variants.includes('05058665406'));
  assert.ok(variants.includes('905058665406'));
});

test('isValidTrMobilePhone geçerli numara', () => {
  assert.equal(isValidTrMobilePhone('05058665406'), true);
});

test('authLogin app_state aramaz ve normalize tablo kullanır', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const source = readFileSync(join(process.cwd(), 'api/_lib/handlers/authLogin.js'), 'utf8');
  assert.doesNotMatch(source, /loadAppState\s*\(/);
  assert.doesNotMatch(source, /repairCustomerDirectory/);
  assert.match(source, /findByPhoneSql\(sql, phone\)/);
});
