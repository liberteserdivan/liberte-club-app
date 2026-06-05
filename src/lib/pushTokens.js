// Geçersiz FCM token hata kodları — bu tokenlar veritabanından silinir
export const INVALID_PUSH_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument'
]);

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
