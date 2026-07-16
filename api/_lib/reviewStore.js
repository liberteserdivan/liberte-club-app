import { getSql } from './sql.js';
import { parseAppStateData, serializeAppStateJson } from './appState.js';
import { applyLoyaltyActionRelational } from './loyaltyStore.js';
import { bumpAppStateRevision } from './relationalState.js';

const STATE_ID = 'liberte';

// app_state global dilimini oku
async function loadGlobalState(sql) {
  const rows = await sql`SELECT data FROM app_state WHERE id = ${STATE_ID} LIMIT 1`;
  return parseAppStateData(rows[0]?.data) || {};
}

// Global dilimi kaydet
async function saveGlobalState(sql, global) {
  await sql`
    INSERT INTO app_state (id, data, updated_at)
    VALUES (${STATE_ID}, ${serializeAppStateJson(global)}, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `;
}

// Bekleyen Google yorum talebini bul
function findPendingRequest(global, requestId) {
  const rows = Array.isArray(global.googleReviewRequests) ? global.googleReviewRequests : [];
  return rows.find((row) => Number(row.id) === Number(requestId) && row.status === 'pending') || null;
}

// Google yorum onayı — +3 LP, relational tablolara yazar
export async function approveGoogleReviewRequest(requestId) {
  const sql = getSql();
  if (!sql) throw new Error('DATABASE_URL eksik');

  const global = await loadGlobalState(sql);
  const request = findPendingRequest(global, requestId);
  if (!request) {
    return { ok: false, code: 'REVIEW_NOT_FOUND', message: 'Bekleyen yorum talebi bulunamadı.' };
  }

  const loyaltyResult = await applyLoyaltyActionRelational({
    customerId: request.customerId,
    action: 'google_review_bonus',
    category: 'coffee',
    note: 'Admin Google yorum onayı'
  });

  if (!loyaltyResult.ok) {
    return {
      ok: false,
      code: 'LOYALTY_FAILED',
      message: loyaltyResult.error || 'LP işlenemedi.'
    };
  }

  const createdAt = new Date().toLocaleString('tr-TR');
  const nextRequests = (global.googleReviewRequests || []).map((row) => (
    Number(row.id) === Number(requestId)
      ? { ...row, status: 'approved', approvedAt: createdAt }
      : row
  ));

  const notification = {
    id: Date.now(),
    customerId: request.customerId,
    title: 'Google yorum bonusun onaylandı',
    body: '+3 LP hesabına işlendi. Teşekkür ederiz.',
    createdAt
  };

  await saveGlobalState(sql, {
    ...global,
    googleReviewRequests: nextRequests,
    notifications: [notification, ...(global.notifications || [])].slice(0, 500)
  });

  await sql`
    UPDATE google_review_requests
    SET status = 'approved', approved_at = ${createdAt}
    WHERE id = ${Number(requestId)}
  `.catch(() => {});

  await bumpAppStateRevision(sql);

  return {
    ok: true,
    customerId: Number(request.customerId),
    pointsAdded: 3,
    newBalance: loyaltyResult.loyalty?.lpBalance ?? null,
    customer: loyaltyResult.customer,
    loyalty: loyaltyResult.loyalty
  };
}

// Google yorum talebini reddet
export async function rejectGoogleReviewRequest(requestId) {
  const sql = getSql();
  if (!sql) throw new Error('DATABASE_URL eksik');

  const global = await loadGlobalState(sql);
  const request = findPendingRequest(global, requestId);
  if (!request) {
    return { ok: false, code: 'REVIEW_NOT_FOUND', message: 'Bekleyen yorum talebi bulunamadı.' };
  }

  const createdAt = new Date().toLocaleString('tr-TR');
  const nextRequests = (global.googleReviewRequests || []).map((row) => (
    Number(row.id) === Number(requestId)
      ? { ...row, status: 'rejected', rejectedAt: createdAt }
      : row
  ));

  const notification = {
    id: Date.now() + 1,
    customerId: request.customerId,
    title: 'Google yorum talebi kapatıldı',
    body: 'Yorum bonus talebin admin tarafından kapatıldı.',
    createdAt
  };

  await saveGlobalState(sql, {
    ...global,
    googleReviewRequests: nextRequests,
    notifications: [notification, ...(global.notifications || [])].slice(0, 500)
  });

  await sql`
    UPDATE google_review_requests
    SET status = 'rejected', rejected_at = ${createdAt}
    WHERE id = ${Number(requestId)}
  `.catch(() => {});

  await bumpAppStateRevision(sql);

  return { ok: true, customerId: Number(request.customerId) };
}
