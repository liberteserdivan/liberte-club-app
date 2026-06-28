import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSqlRequest } from '../api/_lib/sqlRequest.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function createMockRes() {
  return {
    headers: {},
    headersSent: false,
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = String(v); },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    end(body) { this.headersSent = true; if (this.body == null) this.body = body; return this; },
    json(obj) { this.body = obj; this.end(JSON.stringify(obj)); return this; }
  };
}

test('Başarılı yanıt x-request-id / x-handler / x-duration-ms header\u0027lar\u0131 ekler', async () => {
  const handler = withSqlRequest(async (req, res) => {
    res.status(200).json({ ok: true });
  });

  const req = { headers: {}, url: '/api/test?x=1' };
  const res = createMockRes();
  await handler(req, res);

  assert.ok(res.getHeader('x-request-id'), 'x-request-id olmalı');
  assert.equal(res.getHeader('x-handler'), '/api/test');
  assert.ok(res.getHeader('x-duration-ms') !== undefined, 'x-duration-ms olmalı');
});

test('Gelen x-request-id korunur', async () => {
  const handler = withSqlRequest(async (req, res) => {
    res.status(200).json({ ok: true });
  });

  const req = { headers: { 'x-request-id': 'trace-abc-123' }, url: '/api/state' };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.getHeader('x-request-id'), 'trace-abc-123');
});

test('Hata yanıt gövdesinde requestId korunur ve DB detayı sızmaz', async () => {
  const handler = withSqlRequest(async () => {
    throw new Error('postgres connection terminated unexpectedly');
  });

  const req = { headers: {}, url: '/api/state' };
  const res = createMockRes();
  await handler(req, res);

  assert.ok(res.body, 'hata gövdesi olmalı');
  assert.equal(res.body.requestId, res.getHeader('x-request-id'));
  // Ham DB metni sızdırılmamalı
  assert.doesNotMatch(JSON.stringify(res.body), /postgres|connection terminated/i);
});

test('sqlRequest observability header\u0027lar\u0131n\u0131 tanımlar', () => {
  const source = readFileSync(join(root, 'api/_lib/sqlRequest.js'), 'utf8');
  assert.match(source, /'x-request-id'/);
  assert.match(source, /'x-handler'/);
  assert.match(source, /'x-duration-ms'/);
});
