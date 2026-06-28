import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('apiClient LP aksiyonu için kısa (15sn) zaman aşımı tanımlar', () => {
  const source = readFileSync(join(root, 'src/lib/apiClient.js'), 'utf8');
  assert.match(source, /export const LOYALTY_ACTION_REQUEST_OPTIONS = \{ timeoutMs: 15_000 \}/);
});

test('qrClient postLoyaltyAction kısa LP zaman aşımını kullanır (60sn admin değil)', () => {
  const source = readFileSync(join(root, 'src/lib/qrClient.js'), 'utf8');
  assert.match(source, /LOYALTY_ACTION_REQUEST_OPTIONS/);
  // postLoyaltyAction bloğu LP options ile bitmeli
  const fn = source.slice(source.indexOf('export async function postLoyaltyAction'));
  assert.match(fn, /\.\.\.LOYALTY_ACTION_REQUEST_OPTIONS/);
  assert.doesNotMatch(fn.slice(0, fn.indexOf('return data')), /\.\.\.ADMIN_REQUEST_OPTIONS/);
});

test('LP başarısında tam /api/state pull tetiklenmez, sonuç local işlenir', () => {
  const source = readFileSync(join(root, 'src/components/CustomerQrScanner.jsx'), 'utf8');
  // İmzalı (production) başarı yolu: postLoyaltyAction -> return true
  const start = source.indexOf('const result = await postLoyaltyAction');
  const end = source.indexOf('return true;', start);
  const block = source.slice(start, end);
  assert.ok(start !== -1 && end !== -1, 'production LP başarı bloğu bulunamadı');
  // Sunucu sonucu local state'e işlenmeli
  assert.match(block, /syncScannedCustomer\(result\.customer\)/);
  assert.match(block, /result\.loyalty/);
  // Tam state pull (refreshRemote) bu yolda çağrılmamalı
  assert.doesNotMatch(block, /refreshRemote/);
});

test('LP hatasında actionBusy finally bloğunda temizlenir', () => {
  const source = readFileSync(join(root, 'src/components/CustomerQrScanner.jsx'), 'utf8');
  assert.match(source, /finally\s*\{\s*setActionBusy\(false\)/);
});

test('LP işlenirken görünür ilerleme göstergesi var', () => {
  const source = readFileSync(join(root, 'src/components/CustomerQrScanner.jsx'), 'utf8');
  assert.match(source, /actionBusy &&/);
  assert.match(source, /LP işleniyor/);
});
