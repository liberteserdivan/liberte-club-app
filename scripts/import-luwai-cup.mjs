import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const downloads = process.env.USERPROFILE
  ? join(process.env.USERPROFILE, 'Downloads', 'luwai_liberte_logo_duzenlenmis.glb')
  : '';

const source = process.argv[2] || downloads;
const target = join(root, 'public', 'Liberte_Cup_Luwai.glb');

if (!source || !existsSync(source)) {
  console.error('Kaynak GLB bulunamadi:', source || '(bos)');
  process.exit(1);
}

copyFileSync(source, target);
console.log('Kopyalandi:', target);

const opt = spawnSync(process.execPath, [
  join(root, 'scripts', 'optimize-cup-glb.mjs'),
  'Liberte_Cup_Luwai.glb',
  'Liberte_Cup_Luwai_App.glb'
], { stdio: 'inherit', cwd: root });

process.exit(opt.status ?? 1);
