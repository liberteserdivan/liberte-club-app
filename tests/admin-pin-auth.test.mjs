import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('adminPinAuth production ortamında ALTER TABLE çalıştırmaz', () => {
  const source = readFileSync(join(root, 'api', '_lib', 'adminPinAuth.js'), 'utf8');
  assert.match(source, /isProductionRuntime\(\)/);
  assert.match(source, /if \(isProductionRuntime\(\)\) return;/);
});

test('authAdminPin handler ayrı PIN doğrulaması istemez', () => {
  const source = readFileSync(join(root, 'api', '_lib', 'handlers', 'authAdminPin.js'), 'utf8');
  assert.doesNotMatch(source, /verifyAdminPinAttempt/);
  assert.match(source, /markAdminVerified/);
});
