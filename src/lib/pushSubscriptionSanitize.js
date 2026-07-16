// Push cihaz kayıtlarını temizle — pasif, web ve geçersiz tokenları ayıkla
import { isApnsDeviceToken, isFcmRegistrationToken } from './pushTokenFormat.js';
import { isActivePushSubscription, resolvePushChannel } from './pushAudience.js';

// Kayıt satırının zaman damgasını oku
function readRowTime(row) {
  const raw = row?.lastSeenAt || row?.updatedAt || row?.createdAt || '';
  const text = String(raw).trim();
  const trMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (trMatch) {
    const parsed = new Date(Number(trMatch[3]), Number(trMatch[2]) - 1, Number(trMatch[1]));
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  }
  const iso = Date.parse(text);
  if (!Number.isNaN(iso)) return iso;
  return Number(row?.id) || 0;
}

// En güncel kaydı seç
function pickNewestRow(rows = []) {
  return rows.reduce((best, row) => (
    readRowTime(row) >= readRowTime(best) ? row : best
  ), rows[0]);
}

// FCM ile gönderilebilir token mı
export function isDeliverablePushToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) return false;
  if (isApnsDeviceToken(normalized)) return false;
  return isFcmRegistrationToken(normalized);
}

// Üye başına en iyi kaydı seç — native öncelikli
function pickBestForCustomer(rows = []) {
  const nativeRows = rows.filter((row) => resolvePushChannel(row) === 'native');
  const webRows = rows.filter((row) => resolvePushChannel(row) === 'web');
  const keep = pickNewestRow(nativeRows.length ? nativeRows : webRows);
  const drop = rows.filter((row) => row !== keep);
  return { keep, drop };
}

// pushSubscriptions listesini temizle
export function sanitizePushSubscriptions(subscriptions = []) {
  const rows = Array.isArray(subscriptions) ? subscriptions : [];
  const removed = [];
  const reasons = {
    inactive: 0,
    invalid_token: 0,
    duplicate: 0,
    replaced_by_native: 0,
    duplicate_token: 0
  };

  const noteRemoved = (row, reason) => {
    removed.push({ row, reason });
    reasons[reason] = (reasons[reason] || 0) + 1;
  };

  // Token tekrarlarını birleştir
  const byToken = new Map();
  rows.forEach((row) => {
    const token = String(row?.token || '').trim();
    if (!token) {
      noteRemoved(row, 'invalid_token');
      return;
    }
    if (!byToken.has(token)) {
      byToken.set(token, row);
      return;
    }
    const existing = byToken.get(token);
    const keep = pickNewestRow([existing, row]);
    noteRemoved(keep === existing ? row : existing, 'duplicate_token');
    byToken.set(token, keep);
  });

  // Üye başına en uygun cihazı seç
  const byCustomer = new Map();
  for (const row of byToken.values()) {
    const customerId = Number(row.customerId);
    if (!byCustomer.has(customerId)) byCustomer.set(customerId, []);
    byCustomer.get(customerId).push(row);
  }

  const kept = [];
  for (const customerRows of byCustomer.values()) {
    const validRows = [];
    customerRows.forEach((row) => {
      if (!isActivePushSubscription(row)) {
        noteRemoved(row, 'inactive');
        return;
      }
      if (!isDeliverablePushToken(row.token)) {
        noteRemoved(row, 'invalid_token');
        return;
      }
      validRows.push(row);
    });

    if (!validRows.length) continue;

    const { keep, drop } = pickBestForCustomer(validRows);
    drop.forEach((row) => {
      const reason = resolvePushChannel(row) === 'web' && resolvePushChannel(keep) === 'native'
        ? 'replaced_by_native'
        : 'duplicate';
      noteRemoved(row, reason);
    });
    kept.push(keep);
  }

  return {
    subscriptions: kept,
    removed,
    summary: {
      before: rows.length,
      after: kept.length,
      removed: removed.length,
      reasons
    }
  };
}

// Tüm push kayıtlarını sıfırla
export function resetPushSubscriptions() {
  return {
    subscriptions: [],
    removed: [],
    summary: {
      before: 0,
      after: 0,
      removed: 0,
      reset: true,
      reasons: {}
    }
  };
}
