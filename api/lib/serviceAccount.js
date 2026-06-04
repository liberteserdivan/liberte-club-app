const EXPECTED_PROJECT_ID = 'liberte-club';

// Service account alanlarını normalize et
function normalizeAccount(account) {
  if (!account || typeof account !== 'object') return null;

  const copy = { ...account };
  if (copy.private_key && typeof copy.private_key === 'string') {
    copy.private_key = copy.private_key.replace(/\\n/g, '\n');
  }
  return copy;
}

// JSON metnini parse etmeyi dene
function tryParseJson(text) {
  try {
    return normalizeAccount(JSON.parse(text));
  } catch {
    return null;
  }
}

// Base64 service account JSON'unu parse et
function tryParseBase64(text) {
  try {
    return normalizeAccount(JSON.parse(Buffer.from(text, 'base64').toString('utf8')));
  } catch {
    return null;
  }
}

// Service account JSON'unu parse et
export function parseServiceAccount(raw) {
  let text = String(raw || '').trim().replace(/^\uFEFF/, '');
  if (!text) return null;

  // Doğrudan JSON
  let account = tryParseJson(text);
  if (account) return account;

  // Base64
  account = tryParseBase64(text);
  if (account) return account;

  // Vercel çift tırnak sarmalı string
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      const unwrapped = JSON.parse(text);
      account = tryParseJson(unwrapped) || tryParseBase64(unwrapped);
      if (account) return account;
    } catch {
      // devam et
    }
  }

  // Pretty-print JSON — gereksiz boşlukları temizle
  if (text.includes('service_account')) {
    const compact = text.replace(/\r\n/g, '\n').replace(/\n/g, '').replace(/\s{2,}/g, '');
    account = tryParseJson(compact);
    if (account) return account;
  }

  return null;
}

// Parse durumunu döndür — teşhis için
export function getServiceAccountStatus(raw) {
  const text = String(raw || '').trim();
  if (!text) return { state: 'yok', projectId: 'yok' };

  const account = parseServiceAccount(text);
  if (!account) return { state: 'gecersiz', projectId: 'gecersiz' };

  return {
    state: account.project_id === EXPECTED_PROJECT_ID ? 'hazir' : 'yanlis_proje',
    projectId: account.project_id || 'eksik'
  };
}

// Service account geçerli mi kontrol et
export function validateServiceAccount(account) {
  if (!account) {
    return 'FIREBASE_SERVICE_ACCOUNT_JSON okunamadı. JSON tek satır veya base64 olmalı (liberte-club).';
  }

  if (account.project_id && account.project_id !== EXPECTED_PROJECT_ID) {
    return `Service account yanlış proje (${account.project_id}). liberte-club projesinden indirin.`;
  }

  if (!account.private_key || !account.client_email) {
    return 'Service account JSON eksik. private_key ve client_email alanları gerekli.';
  }

  return '';
}

export { EXPECTED_PROJECT_ID };
