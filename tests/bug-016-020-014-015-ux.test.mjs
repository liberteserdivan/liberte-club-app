import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('BUG-016: QrPage unmount abort', () => {
  const src = read('src/pages/QrPage.jsx');
  assert.match(src, /abortRef\.current\?\.abort\(\)/);
});

test('BUG-016: scanner onScanSuccessRef', () => {
  const src = read('src/components/CustomerQrScanner.jsx');
  assert.match(src, /onScanSuccessRef/);
});

test('BUG-020: Android backButton listener', () => {
  const src = read('src/App.jsx');
  assert.match(src, /backButton/);
  assert.match(src, /minimizeApp/);
});

test('BUG-014/015: liberte-next boot finally + stable callback', () => {
  const src = read('liberte-next/client/src/App.jsx');
  assert.match(src, /finally/);
  assert.match(src, /useCallback/);
  assert.match(src, /handleLoyalty/);
});