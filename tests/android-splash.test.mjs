import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Android native splash görselleri üretilmiş olmalı
test('Android splash PNG dosyaları mevcut', () => {
  const folders = [
    'drawable',
    'drawable-port-mdpi',
    'drawable-port-hdpi',
    'drawable-port-xhdpi',
    'drawable-port-xxhdpi',
    'drawable-port-xxxhdpi'
  ];

  for (const folder of folders) {
    const path = join(root, 'android', 'app', 'src', 'main', 'res', folder, 'splash.png');
    assert.equal(existsSync(path), true, `${folder}/splash.png eksik`);
  }
});

test('Android 12 sistem splash ikonu şeffaf', () => {
  const path = join(root, 'android', 'app', 'src', 'main', 'res', 'drawable', 'splash_icon_empty.png');
  assert.equal(existsSync(path), true);
});

test('Android sürüm numarası güncel', () => {
  const gradle = readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8');
  assert.match(gradle, /versionCode 13/);
  assert.match(gradle, /versionName "1\.0\.12"/);
});

test('Capacitor splash yeşil zemin ve splash kaynağı', () => {
  const config = readFileSync(join(root, 'capacitor.config.json'), 'utf8');
  assert.match(config, /"backgroundColor": "#0B2F26"/);
  assert.match(config, /"androidSplashResourceName": "splash"/);
});

test('Android splash.xml kaldırıldı — PNG kullanılıyor', () => {
  const splashXml = join(root, 'android', 'app', 'src', 'main', 'res', 'drawable', 'splash.xml');
  assert.equal(existsSync(splashXml), false);
});
