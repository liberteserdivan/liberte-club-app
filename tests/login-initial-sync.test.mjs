import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('useCommit ilk zorunlu tam pull\'u erteler (login anında /api/state pull yok)', () => {
  const source = readFileSync(join(root, 'src/hooks/useCommit.js'), 'utf8');
  // Erteleme sabiti 5-10sn aralığında olmalı
  assert.match(source, /INITIAL_REMOTE_SYNC_DELAY_MS = 10_000/);
  // Zorunlu pull artık 120ms'de değil, ertelenmiş gecikme (setTimeout) ile yapılmalı.
  // Gövdede Safe Mode guard'ı bulunabilir; bu yüzden setTimeout + INITIAL_REMOTE_SYNC_DELAY_MS
  // ve içeride pullRemote(true) çağrısı ayrı ayrı doğrulanır.
  assert.match(source, /setTimeout\(\(\) => \{[\s\S]*pullRemote\(true\);[\s\S]*\}, INITIAL_REMOTE_SYNC_DELAY_MS\)/);
  assert.doesNotMatch(source, /pullRemote\(true\);\s*scheduleSyncTimer\(\);\s*\}\s*,\s*120\)/);
});

test('Admin members yalnızca doğrulanmış admin oturumunda çekilir', () => {
  const source = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  // useAdminMembers enabled koşulu adminVerified içermeli
  assert.match(source, /useAdminMembers\(\{\s*enabled:\s*Boolean\(isAdmin && adminVerified/);
});

test('Admin PIN gate UI kaldırıldı', () => {
  const source = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  assert.doesNotMatch(source, /AdminPinGate/);
  assert.doesNotMatch(source, /handleAdminVerified/);
});

test('Logout sonrası admin hidrasyonu tekrar çalışabilir (ref sıfırlanır)', () => {
  const source = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  assert.match(source, /adminHydratedRef\.current = false/);
});
