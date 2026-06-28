import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Admin LP işlemleri çift tık guard (runGuardedLp) ile sarılı', () => {
  const source = readFileSync(join(root, 'src/pages/AdminPage.jsx'), 'utf8');
  assert.match(source, /async function runGuardedLp\(customerId, action, category, task\)/);
  // Senkron uçuş kontrolü: ikinci istek engellenir
  assert.match(source, /if \(pendingLpRef\.current\.has\(key\)\) return;/);
  // Üç LP fonksiyonu da guard kullanır
  assert.match(source, /runGuardedLp\(c\.id, 'stamp', category/);
  assert.match(source, /runGuardedLp\(c\.id, 'remove', category/);
  assert.match(source, /runGuardedLp\(c\.id, 'redeem', category/);
});

test('Hata/başarı sonrası uçuş hâli finally bloğunda temizlenir', () => {
  const source = readFileSync(join(root, 'src/pages/AdminPage.jsx'), 'utf8');
  assert.match(source, /finally\s*\{\s*pendingLpRef\.current\.delete\(key\);\s*syncPendingLp\(\);\s*\}/);
});

test('Admin StampCategoryPanel butonları busy iken disabled olur', () => {
  const source = readFileSync(join(root, 'src/components/StampCategoryPanel.jsx'), 'utf8');
  // Admin (compact olmayan) butonlar busy'yi dikkate almalı
  assert.match(source, /onClick=\{\(\) => onAdd\?\.\(cat\.id\)\} disabled=\{busy\}/);
  assert.match(source, /disabled=\{busy \|\| !canUndo\}/);
  assert.match(source, /disabled=\{busy \|\| !canRedeem\}/);
});

test('Panel busy prop\u0027u müşteri bazlı pending ile beslenir', () => {
  const source = readFileSync(join(root, 'src/pages/AdminPage.jsx'), 'utf8');
  assert.match(source, /busy=\{isLpPending\(c\.id\)\}/);
});
