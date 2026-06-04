const PENDING_KEY = 'liberteAuthPending';

// Kod adımı bilgilerini oturumda sakla — mobilde sayfa yenilenince kaybolmasın
export function saveAuthPending(data) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({
    ...data,
    expires: Date.now() + 10 * 60 * 1000
  }));
}

export function loadAuthPending() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (!data?.ph || !data?.em || Date.now() > (data.expires || 0)) {
      sessionStorage.removeItem(PENDING_KEY);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function clearAuthPending() {
  sessionStorage.removeItem(PENDING_KEY);
}
