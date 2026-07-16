import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveApiUrl,
  DEFAULT_NATIVE_API_ORIGIN,
  getNativeApiOrigin
} from '../src/lib/apiClient.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('native API base absolute ve ozel domain', () => {
  const origin = getNativeApiOrigin();
  assert.match(origin, /^https:\/\//);
  assert.match(origin, /app\.liberte\.cafe/);
  assert.doesNotMatch(origin, /vercel\.app/);
  assert.equal(origin, DEFAULT_NATIVE_API_ORIGIN);
  assert.match(resolveApiUrl('/api/auth/login', true), /^https:\/\/.+\/api\/auth\/login$/);
});

test('web platform relative path korunur', () => {
  assert.equal(resolveApiUrl('/api/state', false), '/api/state');
});

test('backend readAuthToken Bearer ve cookie destekler', () => {
  const src = read('api/_lib/auth.js');
  assert.match(src, /export function readAuthToken/);
  assert.match(src, /Bearer /);
  assert.match(src, /SESSION_COOKIE/);
});

test('authSession login yanitinda sessionToken doner', () => {
  const login = read('api/_lib/handlers/authLogin.js');
  assert.match(login, /sessionToken:/);
  const session = read('api/_lib/handlers/authSession.js');
  assert.match(session, /sessionToken/);
});

test('CORS native capacitor origin izinli', async () => {
  const { resolveOrigin, applyCors } = await import('../api/_lib/http.js');
  const req = { headers: { origin: 'capacitor://localhost' } };
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  applyCors(req, res, 'GET,POST,OPTIONS');
  assert.equal(resolveOrigin(req), 'capacitor://localhost');
  assert.equal(headers['Access-Control-Allow-Origin'], 'capacitor://localhost');
  assert.match(headers['Access-Control-Allow-Headers'], /Authorization/);
});

test('src icinde raw fetch(/api yok', () => {
  const apiClientUsers = [
    'src/lib/session.js',
    'src/pages/LoginPage.jsx',
    'src/lib/firebasePush.js',
    'src/lib/db.js',
    'src/lib/adminMemberClient.js'
  ];
  for (const file of apiClientUsers) {
    const src = read(file);
    assert.doesNotMatch(src, /fetch\s*\(\s*['`]\/api/, `${file} raw /api fetch kullanmamali`);
  }
});