import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const nextRoot = path.resolve(here, '..');
const repoRoot = path.resolve(nextRoot, '..');
const clientDir = path.join(nextRoot, 'client');
const rootCapConfig = path.join(repoRoot, 'capacitor.config.json');
const nextCapConfig = path.join(nextRoot, 'capacitor.config.json');
const backupCapConfig = path.join(repoRoot, 'capacitor.config.legacy-backup.json');

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status})`);
  }
}

console.log('[next:prepare-native] client build…');
run('npm', ['run', 'build'], clientDir);

if (!existsSync(rootCapConfig) || !existsSync(nextCapConfig)) {
  throw new Error('capacitor config eksik');
}

const legacyRaw = readFileSync(rootCapConfig, 'utf8');
writeFileSync(backupCapConfig, legacyRaw, 'utf8');

try {
  // Geçici: kök config'i next webDir ile değiştir, sync, geri al
  copyFileSync(nextCapConfig, rootCapConfig);
  console.log('[next:prepare-native] cap sync android (geçici webDir)…');
  run('npx', ['cap', 'sync', 'android'], repoRoot);
  console.log('[next:prepare-native] sync tamam');
} finally {
  writeFileSync(rootCapConfig, legacyRaw, 'utf8');
  console.log('[next:prepare-native] kök capacitor.config.json webDir=dist geri yüklendi');
}

console.log(`
[next:prepare-native] Hazır.
Android APK için:
  cd android && ./gradlew assembleRelease
veya Codemagic workflow: android-next-artifact

Cutover YAPILMADI — production webDir hâlâ dist.
`);
