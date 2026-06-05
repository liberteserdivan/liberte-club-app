export const APP_PUSH_NAME = 'Liberte';
const IOS_TITLE_MAX = 30;

// iOS PWA'da "from [uygulama adı]" satırı sistemden gelir — kaldırılamaz
function isAppName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'liberte club' || normalized === 'liberte';
}

function truncateIosTitle(title) {
  const clean = String(title || '').trim();
  if (clean.length <= IOS_TITLE_MAX) return clean;
  return `${clean.slice(0, IOS_TITLE_MAX - 1)}…`;
}

// Bildirim başlık ve gövdesini iOS düzenine göre hazırla
export function formatPushNotification(title = '', body = '') {
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();

  let finalTitle = cleanTitle;
  let finalBody = cleanBody;

  if ((isAppName(cleanTitle) || !cleanTitle) && cleanBody) {
    finalTitle = cleanBody;
    finalBody = '';
  } else if (cleanTitle && cleanBody && cleanTitle !== cleanBody) {
    finalTitle = cleanTitle;
    finalBody = cleanBody;
  } else if (cleanTitle && !cleanBody) {
    finalTitle = cleanTitle;
    finalBody = '';
  } else if (!cleanTitle && cleanBody) {
    finalTitle = cleanBody;
    finalBody = '';
  } else {
    finalTitle = 'Yeni bildirim';
    finalBody = '';
  }

  if (finalTitle.length > IOS_TITLE_MAX && finalBody) {
    finalTitle = truncateIosTitle(finalTitle);
  } else if (finalTitle.length > IOS_TITLE_MAX) {
    finalBody = finalTitle;
    finalTitle = truncateIosTitle(finalTitle);
  } else {
    finalTitle = truncateIosTitle(finalTitle);
  }

  return { title: finalTitle, body: finalBody };
}

// Service worker — yalnızca iOS'ta sistem bildirimini tekrarlama
export function pushServiceWorkerPlatformSource() {
  return `
function isIosPushClient() {
  return /iPhone|iPad|iPod/i.test(self.navigator?.userAgent || '');
}

function shouldDeferToSystemNotification(payload) {
  return isIosPushClient() && Boolean(payload?.notification?.title);
}`;
}

// Service worker şablonu için aynı mantık
export function pushNotificationFormatterSource() {
  return `${pushServiceWorkerPlatformSource()}

const IOS_TITLE_MAX = 30;

function isAppName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'liberte club' || normalized === 'liberte';
}

function truncateIosTitle(title) {
  const clean = String(title || '').trim();
  if (clean.length <= IOS_TITLE_MAX) return clean;
  return clean.slice(0, IOS_TITLE_MAX - 1) + '…';
}

function formatPushNotification(title, body) {
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();
  let finalTitle = cleanTitle;
  let finalBody = cleanBody;

  if ((isAppName(cleanTitle) || !cleanTitle) && cleanBody) {
    finalTitle = cleanBody;
    finalBody = '';
  } else if (cleanTitle && cleanBody && cleanTitle !== cleanBody) {
    finalTitle = cleanTitle;
    finalBody = cleanBody;
  } else if (cleanTitle && !cleanBody) {
    finalTitle = cleanTitle;
    finalBody = '';
  } else if (!cleanTitle && cleanBody) {
    finalTitle = cleanBody;
    finalBody = '';
  } else {
    finalTitle = 'Yeni bildirim';
    finalBody = '';
  }

  if (finalTitle.length > IOS_TITLE_MAX && finalBody) {
    finalTitle = truncateIosTitle(finalTitle);
  } else if (finalTitle.length > IOS_TITLE_MAX) {
    finalBody = finalTitle;
    finalTitle = truncateIosTitle(finalTitle);
  } else {
    finalTitle = truncateIosTitle(finalTitle);
  }

  return { title: finalTitle, body: finalBody };
}`;
}
