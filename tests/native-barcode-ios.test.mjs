import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'src/lib/nativeBarcodeScan.js'), 'utf8');

test('nativeBarcodeScan: Google Code Scanner modulu sadece Android icin zorunlu', () => {
  assert.match(src, /import \{ isAndroid, isNativeApp \}/);
  assert.match(src, /if \(!isAndroid\(\)\) return true/);
  assert.match(src, /isGoogleBarcodeScannerModuleAvailable/);
});
