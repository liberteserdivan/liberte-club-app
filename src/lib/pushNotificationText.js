export const APP_PUSH_NAME = 'Liberte';
export const PUSH_TITLE_MAX = 65;
export const PUSH_BODY_MAX = 500;

// iOS PWA'da "from [uygulama adı]" satırı sistemden gelir — kaldırılamaz
function isAppName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'liberte club' || normalized === 'liberte';
}

function clampText(value, max) {
  const clean = String(value || '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1))}…`;
}

// Bildirim başlık ve gövdesini platformlara uygun hazırla
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

  if (finalTitle.length > PUSH_TITLE_MAX && finalBody) {
    finalTitle = clampText(finalTitle, PUSH_TITLE_MAX);
  } else if (finalTitle.length > PUSH_TITLE_MAX) {
    finalBody = finalTitle.slice(PUSH_TITLE_MAX).trim() || finalBody;
    finalTitle = clampText(finalTitle, PUSH_TITLE_MAX);
  }

  return {
    title: clampText(finalTitle, PUSH_TITLE_MAX),
    body: clampText(finalBody, PUSH_BODY_MAX)
  };
}

// Service worker şablonu için aynı mantık
export function pushNotificationFormatterSource() {
  return `
const PUSH_TITLE_MAX = ${PUSH_TITLE_MAX};
const PUSH_BODY_MAX = ${PUSH_BODY_MAX};

function isAppName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'liberte club' || normalized === 'liberte';
}

function clampText(value, max) {
  const clean = String(value || '').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, Math.max(0, max - 1)) + '…';
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

  if (finalTitle.length > PUSH_TITLE_MAX && finalBody) {
    finalTitle = clampText(finalTitle, PUSH_TITLE_MAX);
  } else if (finalTitle.length > PUSH_TITLE_MAX) {
    finalBody = finalTitle.slice(PUSH_TITLE_MAX).trim() || finalBody;
    finalTitle = clampText(finalTitle, PUSH_TITLE_MAX);
  }

  return {
    title: clampText(finalTitle, PUSH_TITLE_MAX),
    body: clampText(finalBody, PUSH_BODY_MAX)
  };
}`;
}
