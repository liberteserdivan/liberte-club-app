import { existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distSw = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'firebase-messaging-sw.js');

// Canlıda runtime SW API kullanılsın — statik dosyayı kaldır
if (existsSync(distSw)) {
  unlinkSync(distSw);
  console.log('dist/firebase-messaging-sw.js kaldırıldı (runtime SW aktif).');
}
