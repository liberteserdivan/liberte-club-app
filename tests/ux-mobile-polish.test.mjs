import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('viewport: yakinlastirma kilitli', () => {
  const html = read('index.html');
  assert.match(html, /maximum-scale=1\.0/);
  assert.match(html, /user-scalable=no/);
});

test('Android WebView zoom kapali', () => {
  const src = read('android/app/src/main/java/cafe/liberte/app/MainActivity.java');
  assert.match(src, /setSupportZoom\(false\)/);
  assert.match(src, /setBuiltInZoomControls\(false\)/);
});

test('PushMessageSheet alt sheet kullanir', () => {
  // Invariant: push mesajı marka kartı backdrop ile açılır; eski noticeModal kullanılmaz.
  // Class adları pushBanner* olarak evrildi — davranış (backdrop + kapat) korunmalı.
  const src = read('src/components/PushMessageSheet.jsx');
  assert.match(src, /(?:pushSheetBackdrop|pushBannerBackdrop)/);
  assert.match(src, /(?:pushSheetHandle|pushBannerClose|pushBannerCta)/);
  assert.doesNotMatch(src, /noticeModal/);
});

test('Bildirim merkezi inbox duzeni', () => {
  const src = read('src/components/Cards.jsx');
  assert.match(src, /notifInbox/);
  assert.match(src, /notifInboxItem/);
});

test('Profil alt spacer ve scroll padding', () => {
  const page = read('src/pages/ProfilePage.jsx');
  const css = read('src/style.css');
  assert.match(page, /pageEndSpacer/);
  assert.match(css, /--page-scroll-bottom:calc\(28px \+ var\(--nav-dock-total\)\)/);
});
