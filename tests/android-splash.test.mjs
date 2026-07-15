import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Android native splash yalnizca yesil zemin XML', () => {
  const splashXml = join(root, 'android', 'app', 'src', 'main', 'res', 'drawable', 'splash.xml');
  assert.equal(existsSync(splashXml), true);
  const xml = readFileSync(splashXml, 'utf8');
  assert.match(xml, /splash_background/);
});

test('Android tam ekran splash PNG kullanilmiyor', () => {
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
    assert.equal(existsSync(path), false, `${folder}/splash.png kaldirilmali`);
  }
});

test('Android 12 sistem splash ikonu şeffaf', () => {
  const path = join(root, 'android', 'app', 'src', 'main', 'res', 'drawable', 'splash_icon_empty.png');
  assert.equal(existsSync(path), true);
});

test('Android sürüm numarası güncel', () => {
  const gradle = readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8');
  const match = gradle.match(/versionCode\s+(\d+)/);
  assert.ok(match, 'versionCode bulunamadi');
  assert.ok(Number(match[1]) >= 60, 'versionCode en az 60 olmali');
  assert.match(gradle, /versionName "1\.1\.31"/);
});

test('Capacitor splash yeşil zemin', async () => {
  // Invariant: native splash marka yeşili kullanır; React tarafı SplashScreen.hide ile kapatır.
  // launchAutoHide bilinçli olarak true (OS otomatik kapatır) — hideNativeSplash yedek yol.
  const config = JSON.parse(readFileSync(join(root, 'capacitor.config.json'), 'utf8'));
  const splash = config?.plugins?.SplashScreen || {};
  assert.equal(splash.backgroundColor, '#0B2F26');
  assert.equal(typeof splash.launchAutoHide, 'boolean');
  const splashMod = await import(pathToFileURL(join(root, 'src', 'lib', 'nativeSplash.js')).href);
  assert.equal(typeof splashMod.hideNativeSplash, 'function');
  assert.equal(typeof splashMod.scheduleNativeSplashFailsafe, 'function');
});

test('React splash şeffaf logo kullanır', () => {
  const constants = readFileSync(join(root, 'src', 'lib', 'constants.js'), 'utf8');
  assert.match(constants, /SPLASH_LOGO = '\/liberte-logo\.png/);
});
