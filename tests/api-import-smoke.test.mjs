// API modul sagligi smoke testi — BUG-001 / BUG-002 sinifi bozulmalara kalici koruma.
// Metin eslesmesi yapmaz; gercek Node parse/import davranisini dogrular:
//   1. api/**/*.js dosyalari UTF-16 BOM veya NUL byte icermemeli (kodlama bozulmasi)
//   2. api/**/*.js dosyalarinin TAMAMI gercekten import edilebilmeli
//      (import, parse hatalarini da yakalar; modul calistirma DB baglantisi acmaz —
//      sql istemcisi lazy olusturulur, test env secret ve network gerektirmez)
//   3. Router'larin dinamik yukledigi handler moduller ozellikle dogrulanir
//      (gecmiste bozulan authSession.js ve adminQrVerify.js dahil)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// api/ altindaki tum .js kaynak dosyalarini topla (alt klasorler dahil)
function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const API_FILES = collectJsFiles(join(ROOT, 'api'));
const HANDLER_DIR = join(ROOT, 'api', '_lib', 'handlers');

test('api/ altinda kaynak dosyalar bulunur', () => {
  assert.ok(API_FILES.length > 0, 'api/**/*.js dosyalari bulunamadi');
});

// 1) Kodlama sagligi: UTF-16 BOM ve NUL byte kontrolu
//    (BOM'suz UTF-16 dahil her kodlama bozulmasi NUL byte uretir — BUG-002 boyle yakalanirdi)
test('api/**/*.js dosyalari UTF-16 BOM veya NUL byte icermez', () => {
  const broken = [];
  for (const file of API_FILES) {
    const buf = readFileSync(file);
    const hasUtf16Bom =
      buf.length >= 2 &&
      ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff));
    const hasNulByte = buf.includes(0x00);
    if (hasUtf16Bom || hasNulByte) {
      broken.push(`${file} (bom=${hasUtf16Bom}, nul=${hasNulByte})`);
    }
  }
  assert.deepEqual(broken, [], `Kodlamasi bozuk dosyalar: ${broken.join(', ')}`);
});

// 2) Gercek import sagligi: TUM api dosyalari (parse hatasi = import hatasi)
//    Sozdizimi eksigi (BUG-001) veya kodlama bozulmasi (BUG-002) burada patlar.
test('api/**/*.js dosyalarinin tamami import edilebilir', async () => {
  const failures = [];
  for (const file of API_FILES) {
    try {
      await import(pathToFileURL(file).href);
    } catch (err) {
      failures.push(`${file}: ${err.message}`);
    }
  }
  assert.deepEqual(failures, [], `Import edilemeyen dosyalar:\n${failures.join('\n')}`);
});

// 3) Dinamik yuklenen handler'lar export'lariyla birlikte dogrulanir
test('handler modulleri bos olmayan export listesi verir', async () => {
  const failures = [];
  for (const file of collectJsFiles(HANDLER_DIR)) {
    try {
      const mod = await import(pathToFileURL(file).href);
      if (!mod || Object.keys(mod).length === 0) {
        failures.push(`${file}: export bulunamadi`);
      }
    } catch (err) {
      failures.push(`${file}: ${err.message}`);
    }
  }
  assert.deepEqual(failures, [], `Sorunlu handler'lar:\n${failures.join('\n')}`);
});

test('authSession.js import edilir ve handleAuthSession export eder', async () => {
  const mod = await import(pathToFileURL(join(HANDLER_DIR, 'authSession.js')).href);
  assert.equal(typeof mod.handleAuthSession, 'function');
});

test('adminQrVerify.js import edilir ve QR handler fonksiyonlarini export eder', async () => {
  const mod = await import(pathToFileURL(join(HANDLER_DIR, 'adminQrVerify.js')).href);
  assert.equal(typeof mod.handleAdminQrVerify, 'function');
  assert.equal(typeof mod.handleAdminMemberLookup, 'function');
});
