import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Menü detay modalı iPad uyumluluğu — portal ve tablet CSS kuralları
test('MenuProductDetailModal document.body portal kullanır', () => {
  const source = readFileSync(join(root, 'src/components/MenuProductDetailModal.jsx'), 'utf8');
  assert.match(source, /createPortal/);
  assert.match(source, /document\.body/);
});

test('Menü detay modal CSS tablet kuralları mevcut', () => {
  const css = readFileSync(join(root, 'src/style.css'), 'utf8');
  assert.match(css, /\.menuDetailBackdrop[\s\S]*z-index:10120/);
  assert.match(css, /@media \(min-width:768px\)[\s\S]*\.menuDetailBackdrop/);
  assert.match(css, /body\.menuDetailOpen/);
  assert.doesNotMatch(css, /\.menuDetailBackdrop[\s\S]*backdrop-filter/);
});
