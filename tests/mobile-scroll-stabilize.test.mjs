import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('CSS: html/body dikey scroll kilitli - tek yuzey .app/.appBoot', () => {
  const css = read('src/style.css');
  assert.match(css, /body\{[^}]*overflow:hidden/);
  assert.match(css, /html\{[^}]*overflow:hidden/);
  assert.match(css, /\.app\{[^}]*overflow-y:auto/);
  assert.match(css, /\.appBoot\{[^}]*overflow-y:auto/);
  assert.doesNotMatch(css, /html\{[^}]*touch-action:\s*none/);
  assert.doesNotMatch(css, /body\{[^}]*touch-action:\s*none/);
});

test('App: push kaydi db degisiminde yeniden planlanmaz', () => {
  const app = read('src/App.jsx');
  assert.match(app, /ensurePushRegisteredIfPermitted\(liveCustomer, dbRef\.current, commit\)/);
  assert.match(app, /\[customer\?\.id, commit\]/);
  assert.doesNotMatch(app, /registerTimer/);
});

test('App: hydrate snapshot ile ana UI hemen acar', () => {
  const app = read('src/App.jsx');
  // Invariant: yerel snapshot varsa uzun hydrate login'i bloke etmez;
  // fail-soft retry süresi sonlu bir sabittir (değer bilinçli olarak düşürülebilir).
  assert.match(app, /Snapshot varsa hydrate ekran/);
  assert.match(app, /LOCAL_BOOT/);
  assert.match(app, /CUSTOMER_HYDRATE_RETRY_MS\s*=\s*[\d_]+/);
  const retryMatch = app.match(/CUSTOMER_HYDRATE_RETRY_MS\s*=\s*([\d_]+)/);
  const retryMs = Number(String(retryMatch?.[1] || '').replace(/_/g, ''));
  assert.ok(Number.isFinite(retryMs) && retryMs > 0 && retryMs <= 30_000, 'hydrate retry sonlu olmali');
  assert.doesNotMatch(app, /CUSTOMER_HYDRATE_MS\s*=/);
});

test('Profil hero dar ekran 430px e kadar tasmaz', () => {
  const css = read('src/style.css');
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /profileHeroCard/);
});

test('Kaynak dosyalar UTF-8 BOM icermez', () => {
  const paths = [
    'src/App.jsx',
    'src/style.css',
    'api/_lib/sql.js',
    'api/_lib/handlers/authLogin.js'
  ];
  for (const rel of paths) {
    const buf = readFileSync(join(root, rel));
    const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    assert.equal(hasBom, false, rel + ' BOM icermemeli');
  }
});
