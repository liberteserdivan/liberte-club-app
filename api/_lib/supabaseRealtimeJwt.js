import { createHmac, randomUUID } from 'node:crypto';

const TOKEN_TTL_SEC = 60 * 60 * 24;

// Base64url encode
function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

// Supabase Realtime için kısa ömürlü JWT üret — yalnızca backend
export function mintSupabaseRealtimeJwt({
  customerId,
  isAdmin = false,
  adminVerified = false
} = {}) {
  const secret = String(process.env.SUPABASE_JWT_SECRET || '').trim();
  if (!secret || !customerId) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    iss: 'supabase',
    sub: String(customerId),
    customer_id: String(customerId),
    is_admin: Boolean(isAdmin),
    admin_verified: Boolean(adminVerified),
    iat: now,
    exp: now + TOKEN_TTL_SEC,
    jti: randomUUID()
  };

  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

// API yanıtına realtime token ekle
export function withRealtimeToken(body, session = {}) {
  const token = mintSupabaseRealtimeJwt({
    customerId: session.customerId,
    isAdmin: session.isAdmin,
    adminVerified: session.adminVerified
  });
  if (!token) return body;
  return { ...body, realtimeToken: token };
}
