import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const downloads = join(process.env.USERPROFILE || '', 'Downloads');
const target = join(root, 'public', 'Liberte_Cup_Meshy.glb');
const manual = process.argv[2];

// Meshy'den indirilen GLB'yi public klasörüne kopyala
function pickSource() {
  if (manual && existsSync(manual)) return manual;

  const preferred = [
    join(downloads, 'Liberte_Cup_Meshy.glb'),
    join(downloads, 'model.glb'),
    join(downloads, 'meshy.glb')
  ];

  for (const file of preferred) {
    if (existsSync(file)) return file;
  }

  const glbs = readdirSync(downloads)
    .filter((name) => name.toLowerCase().endsWith('.glb'))
    .map((name) => join(downloads, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  return glbs[0] || null;
}

const source = pickSource();
if (!source) {
  console.error('GLB bulunamadı. Meshy sayfasından GLB indirip Downloads klasörüne kaydet.');
  process.exit(1);
}

copyFileSync(source, target);
console.log('Kopyalandı:', source);
console.log('Hedef:', target, `(${Math.round(statSync(target).size / 1024)} KB)`);
