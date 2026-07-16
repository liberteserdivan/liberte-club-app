/**
 * Tanılama endpoint'leri için ortak header — CONFIG_DIAG_SECRET env
 */
export function diagFetchHeaders() {
  const secret = String(process.env.CONFIG_DIAG_SECRET || '').trim();
  if (!secret) return {};
  return { 'X-Config-Diag': secret };
}

// fetch init nesnesine tanılama header'ı ekle
export function diagFetchInit(init = {}) {
  const diag = diagFetchHeaders();
  if (!Object.keys(diag).length) return init;
  return {
    ...init,
    headers: { ...(init.headers || {}), ...diag }
  };
}
