// Geçersiz FCM token hata kodları — bu tokenlar veritabanından silinir
export const INVALID_PUSH_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument'
]);

// Gönderim hatası sonrası silinecek token kodları
export const REMOVABLE_PUSH_FAILURE_CODES = new Set([
  ...INVALID_PUSH_TOKEN_CODES,
  'messaging/third-party-auth-error'
]);

// FCM yanıtından başarısız tokenları topla
export function collectFailedPushTokens(tokens = [], responses = [], options = {}) {
  const allowThirdPartyRemoval = Boolean(options.allowThirdPartyRemoval);
  const failed = [];
  responses.forEach((row, index) => {
    if (row?.success) return;
    const code = row?.error?.code || '';
    if (code === 'messaging/third-party-auth-error' && !allowThirdPartyRemoval) return;
    if (!REMOVABLE_PUSH_FAILURE_CODES.has(code)) return;
    const token = tokens[index];
    if (token) failed.push(token);
  });
  return [...new Set(failed)];
}

// Kayıtlı push aboneliklerinden geçersiz tokenları çıkar
export function pruneInvalidPushTokens(subscriptions = [], invalidTokens = []) {
  if (!invalidTokens.length) return { subscriptions, removed: 0 };

  const invalidSet = new Set(invalidTokens.filter(Boolean));
  const next = subscriptions.filter((row) => !invalidSet.has(row.token));

  return {
    subscriptions: next,
    removed: subscriptions.length - next.length
  };
}
