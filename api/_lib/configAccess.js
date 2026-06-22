import { timingSafeEqual } from 'node:crypto';
import { getSessionForQr } from './auth.js';
import { getSql } from './appState.js';
import { isProductionRuntime } from './schemaReady.js';

// Tanılama endpoint'leri için gizli anahtar oku (header veya query)
function readProvidedDiagSecret(req) {
  const header = String(req.headers['x-config-diag'] || '').trim();
  const query = String(req.query?.diagSecret || '').trim();
  return header || query;
}

// Ortam değişkenindeki tanılama anahtarı ile eşleşiyor mu?
function matchesDiagSecret(provided) {
  const expected = String(process.env.CONFIG_DIAG_SECRET || '').trim();
  if (!expected || !provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Yönetici + PIN doğrulaması — yanıt yazmadan kontrol
async function hasVerifiedAdminSession(req) {
  const identity = await getSessionForQr(req);
  if (!identity?.adminVerified) return false;

  const sql = getSql();
  if (sql) {
    const { findCustomerById } = await import('./customersStore.js');
    const live = await findCustomerById(sql, identity.customerId);
    return Boolean(live?.isAdmin);
  }

  return Boolean(identity.isAdmin);
}

// Production'da db-status / push-status / qr-status erişim kontrolü
export async function requireConfigDiagAccess(req) {
  if (!isProductionRuntime()) return true;
  if (matchesDiagSecret(readProvidedDiagSecret(req))) return true;
  return hasVerifiedAdminSession(req);
}
