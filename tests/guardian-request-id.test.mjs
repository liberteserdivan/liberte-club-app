import test from 'node:test';
import assert from 'node:assert/strict';
import { withSqlRequest } from '../api/_lib/sqlRequest.js';
import { createRequestId, resolveRequestId, isGuardianRequestId } from '../api/_lib/guardian/requestId.js';

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

test('createRequestId LBT- önekiyle kimlik üretir', () => {
  const id = createRequestId();
  assert.match(id, /^LBT-[0-9A-F]{6}$/);
  assert.ok(isGuardianRequestId(id));
});

test('resolveRequestId geçerli gelen kimliği korur, geçersizi yeniler', () => {
  assert.equal(resolveRequestId('trace-abc-123'), 'trace-abc-123');
  // Geçersiz (boşluk/uzunluk) → yeni LBT- kimliği
  assert.match(resolveRequestId('a b'), /^LBT-/);
  assert.match(resolveRequestId(''), /^LBT-/);
});

test('API yanıtı guardian header\u0027larını ekler (safe-mode + guardian-status)', async () => {
  const handler = withSqlRequest(async (req, res) => { res.status(200).json({ ok: true }); });
  const req = { headers: {}, url: '/api/guardian/health', method: 'GET' };
  const res = createMockRes();
  await handler(req, res);

  assert.match(res.getHeader('x-request-id'), /^LBT-/);
  assert.equal(res.getHeader('x-safe-mode'), 'off');
  assert.ok(res.getHeader('x-guardian-status'));
});

test('Hata yanıt gövdesinde LBT- requestId döner', async () => {
  const handler = withSqlRequest(async () => { throw new Error('postgres connection terminated'); });
  const req = { headers: {}, url: '/api/loyalty' };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.body.requestId, res.getHeader('x-request-id'));
  assert.match(res.body.requestId, /^LBT-/);
  assert.doesNotMatch(JSON.stringify(res.body), /postgres|connection terminated/i);
});
