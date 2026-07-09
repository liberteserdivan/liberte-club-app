// Ağ ve DNS hatalarını tek yerde sınıflandır — ham Capacitor metni kullanıcıya gösterilmez

function readMessage(errorOrMessage) {
  if (typeof errorOrMessage === 'string') return errorOrMessage;
  return String(errorOrMessage?.message || '');
}

// Çözülemeyen host / çevrimdışı / fetch kırılması
export function isResolvableNetworkFailure(errorOrMessage) {
  const message = readMessage(errorOrMessage).toLowerCase();
  if (!message) return false;

  return message === 'failed to fetch'
    || message === 'load failed'
    || message.includes('network request failed')
    || message.includes('the internet connection appears to be offline')
    || message.includes('unable to resolve host')
    || message.includes('no address associated with hostname')
    || message.includes('err_name_not_resolved')
    || message.includes('enotfound')
    || message.includes('network is unreachable')
    || message.includes('connection refused')
    || message.includes('connection reset');
}

// Eski mobil build — vercel.app host'u gömülü kalmış olabilir
export function isStaleNativeHostError(errorOrMessage) {
  return readMessage(errorOrMessage).toLowerCase().includes('vercel.app');
}

// Kullanıcıya gösterilecek Türkçe ağ mesajı
export function humanizeNetworkFailure(errorOrMessage, { forLogin = false } = {}) {
  if (isStaleNativeHostError(errorOrMessage)) {
    return 'Bu uygulama sürümü güncel değil. Play Store veya TestFlight üzerinden son güncellemeyi yükleyin.';
  }

  if (forLogin) {
    return 'Giriş şu an tamamlanamadı. İnternet bağlantınızı kontrol edip birkaç saniye sonra tekrar deneyin.';
  }

  return 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.';
}
