// Bildirim metin limitleri (iOS/Android kilit ekranı için dengeli)
export const PUSH_TITLE_MAX = 65;
export const PUSH_BODY_MAX = 500;

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

  // Uzun başlık + gövde varsa başlığı kısalt; gövde ayrı kalsın
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
