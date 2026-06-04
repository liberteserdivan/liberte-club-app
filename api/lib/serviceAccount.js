const EXPECTED_PROJECT_ID = 'liberte-club';

// Service account JSON'unu parse et
export function parseServiceAccount(raw) {
  let text = String(raw || '').trim();
  if (!text) return null;

  // Vercel bazen JSON'u çift tırnak içinde saklar
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      text = JSON.parse(text);
    } catch {
      // devam et
    }
  }

  let account = null;
  try {
    account = JSON.parse(text);
  } catch {
    try {
      account = JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }

  // private_key satır sonlarını düzelt
  if (account?.private_key && typeof account.private_key === 'string') {
    account.private_key = account.private_key.replace(/\\n/g, '\n');
  }

  return account;
}

// Service account geçerli mi kontrol et
export function validateServiceAccount(account) {
  if (!account) {
    return 'FIREBASE_SERVICE_ACCOUNT_JSON yok veya geçersiz. Firebase liberte-club service account JSON ekleyin.';
  }

  if (account.project_id && account.project_id !== EXPECTED_PROJECT_ID) {
    return `Service account yanlış proje (${account.project_id}). liberte-club projesinden yeni key indirin.`;
  }

  if (!account.private_key || !account.client_email) {
    return 'Service account JSON eksik (private_key / client_email). Dosyayı tek satır olarak yeniden yapıştırın.';
  }

  return '';
}
