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

test('AdminPinGate auth isteğinde uzun timeout kullanır', () => {
  const source = readFileSync(join(root, 'src', 'components', 'AdminPinGate.jsx'), 'utf8');
  assert.match(source, /AUTH_REQUEST_OPTIONS/);
  assert.match(source, /formatClientApiError/);
});
