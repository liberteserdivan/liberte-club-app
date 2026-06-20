import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mintSupabaseRealtimeJwt, withRealtimeToken } from '../api/_lib/supabaseRealtimeJwt.js';

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  assert.equal(parts.length, 3);
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

test('mintSupabaseRealtimeJwt — secret yoksa null', () => {
  const prev = process.env.SUPABASE_JWT_SECRET;
  delete process.env.SUPABASE_JWT_SECRET;
  assert.equal(mintSupabaseRealtimeJwt({ customerId: 42 }), null);
  process.env.SUPABASE_JWT_SECRET = prev;
});

test('mintSupabaseRealtimeJwt — claim alanları doğru', () => {
  const secret = 'test-jwt-secret-32chars-minimum!!';
  process.env.SUPABASE_JWT_SECRET = secret;

  const token = mintSupabaseRealtimeJwt({
    customerId: 99,
    isAdmin: true,
    adminVerified: true
  });

  assert.ok(token);
  const payload = decodeJwtPayload(token);
  assert.equal(payload.role, 'authenticated');
  assert.equal(payload.customer_id, '99');
  assert.equal(payload.is_admin, true);
  assert.equal(payload.admin_verified, true);

  const [header, body] = token.split('.');
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  assert.equal(token.split('.')[2], sig);
});

test('withRealtimeToken — body genişletir', () => {
  process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret-32chars-minimum!!';
  const out = withRealtimeToken({ ok: true }, { customerId: 7, isAdmin: false, adminVerified: false });
  assert.equal(out.ok, true);
  assert.ok(out.realtimeToken);
});
