export const APP_PUSH_NAME = 'Liberte Club';

// iOS PWA'da başlık uygulama adıyla aynıysa "from Liberte Club" satırı çıkar
export function formatPushNotification(title = '', body = '') {
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();

  const isAppName = (value) => {
    const normalized = value.toLowerCase();
    return normalized === 'liberte club' || normalized === 'liberte';
  };

  if ((isAppName(cleanTitle) || !cleanTitle) && cleanBody) {
    return { title: cleanBody, body: '' };
  }

  return {
    title: cleanTitle || APP_PUSH_NAME,
    body: cleanBody || 'Yeni bir bildirimin var.'
  };
}

// Service worker şablonu için aynı mantık (inline üretim)
export function pushNotificationFormatterSource() {
  return `
function formatPushNotification(title, body) {
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();
  const isAppName = (value) => {
    const normalized = value.toLowerCase();
    return normalized === 'liberte club' || normalized === 'liberte';
  };
  if ((isAppName(cleanTitle) || !cleanTitle) && cleanBody) {
    return { title: cleanBody, body: '' };
  }
  return {
    title: cleanTitle || 'Liberte Club',
    body: cleanBody || 'Yeni bir bildirimin var.'
  };
}`;
}
