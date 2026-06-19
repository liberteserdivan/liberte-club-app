import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatClientApiError } from '../src/lib/apiErrors.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('formatClientApiError 401 Ref ekler', () => {
  const result = formatClientApiError({
    response: { status: 401 },
    data: { message: 'Oturum gerekli', requestId: 'req-abc' }
  });
  assert.match(result.message, /Oturum gerekli/);
  assert.match(result.message, /Ref: req-abc/);
});

test('formatClientApiError timeout ayrı mesaj', () => {
  const result = formatClientApiError({
    error: { code: 'FETCH_TIMEOUT' },
    data: { requestId: 'req-timeout' }
  });
  assert.match(result.message, /Sunucuya ulaşılamadı/);
  assert.match(result.message, /Ref: req-timeout/);
});

test('formatClientApiError AbortError sessiz', () => {
  const result = formatClientApiError({ error: { name: 'AbortError' } });
  assert.equal(result.abort, true);
  assert.equal(result.message, '');
});

test('auth session bootstrap invalidate kullanmaz', () => {
  const auth = readFileSync(join(root, 'api/_lib/auth.js'), 'utf8');
  const session = readFileSync(join(root, 'api/_lib/handlers/authSession.js'), 'utf8');
  assert.match(auth, /getSessionForBootstrap/);
  assert.match(session, /getSessionForBootstrap/);
  assert.match(session, /auth\.session-restore/);
  assert.doesNotMatch(session, /getSession\(req\)/);
});

test('db-status Neon production blok işaretler', () => {
  const source = readFileSync(join(root, 'api/config.js'), 'utf8');
  assert.match(source, /neonBlocked/);
  assert.match(source, /\/api\/qr\/generate/);
});

test('remoteFetch generic sunucu yanıt vermedi kullanmaz', () => {
  const source = readFileSync(join(root, 'src/lib/remoteFetch.js'), 'utf8');
  assert.doesNotMatch(source, /Sunucu yanıt vermedi/);
  assert.match(source, /REMOTE_BACKOFF/);
});

test('apiClient clientMessage üretir', () => {
  const source = readFileSync(join(root, 'src/lib/apiClient.js'), 'utf8');
  assert.match(source, /clientMessage/);
  assert.match(source, /formatClientApiError/);
});
