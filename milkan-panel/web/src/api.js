const TOKEN_KEY = 'milkan_panel_token';

/** API isteği gönderir */
export async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || 'İstek başarısız');
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Oturum token kaydeder */
export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Oturum token siler */
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Oturum var mı */
export function hasToken() {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}

/** Terazi CSV indirir */
export async function downloadTeraziCsv() {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch('/api/sync/terazi/export', {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) throw new Error('Terazi dosyası alınamadı');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `terazi-plu-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
