import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readMenuDetailCssBlock() {
  const css = readFileSync(join(root, 'src/style.css'), 'utf8');
  const start = css.indexOf('/* Menü ürün detay modalı */');
  const end = css.indexOf('/* Statik sadakat bardağı', start);
  assert.ok(start >= 0 && end > start, 'Menü detay CSS bloğu bulunamadı');
  return css.slice(start, end);
}

// Menü detay modalı iPad uyumluluğu — portal ve tablet CSS kuralları
test('MenuProductDetailModal document.body portal kullanır', () => {
  const source = readFileSync(join(root, 'src/components/MenuProductDetailModal.jsx'), 'utf8');
  assert.match(source, /createPortal/);
  assert.match(source, /document\.body/);
});

test('Menü detay modal CSS tablet kuralları mevcut', () => {
  const block = readMenuDetailCssBlock();
  assert.match(block, /\.menuDetailBackdrop[\s\S]*z-index:10120/);
  assert.match(block, /body\.menuDetailOpen/);
  assert.doesNotMatch(block, /backdrop-filter/);
});

test('AppSplash tek tam ekran görsel kullanır', () => {
  const source = readFileSync(join(root, 'src/components/AppSplash.jsx'), 'utf8');
  const constants = readFileSync(join(root, 'src/lib/constants.js'), 'utf8');
  assert.match(source, /createPortal/);
  assert.match(source, /SPLASH_IMAGE/);
  assert.match(source, /appSplashImage/);
  assert.match(constants, /liberte-club-splash-master\.png/);
});

test('Açılış bootstrap zaman aşımı tanımlı', () => {
  const app = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  const bootstrap = readFileSync(join(root, 'src/lib/appBootstrap.js'), 'utf8');
  assert.match(bootstrap, /bootstrapSessionWithTimeout/);
  assert.match(app, /SPLASH_FORCE_MS/);
  assert.match(app, /bootstrapSessionWithTimeout/);
  assert.doesNotMatch(app, /hideNativeSplash\(\);\s*\n\s*\}, \[\]\)/);
});
