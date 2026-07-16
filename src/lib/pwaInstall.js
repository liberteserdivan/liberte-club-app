import { isAndroid, isIos, isStandalonePwa } from './platform.js';

let deferredPrompt = null;

// beforeinstallprompt — React yüklenmeden önce yakala
export function initPwaInstallCapture() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    window.dispatchEvent(new CustomEvent('liberte:pwa-install-ready'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('liberte:pwa-installed'));
  });
}

// Tarayıcının sakladığı kurulum istemini döndür
export function getDeferredPwaPrompt() {
  return deferredPrompt;
}

// Kurulum istemini temizle
export function clearDeferredPwaPrompt() {
  deferredPrompt = null;
}

// Platforma göre manuel kurulum yönergesi
export function getInstallHelpText() {
  if (isIos()) {
    return 'Safari\'de alttaki paylaş simgesine dokun → "Ana Ekrana Ekle" seçeneğini kullan.';
  }
  if (isAndroid()) {
    return 'Chrome\'da sağ üstteki ⋮ menüsüne dokun → "Ana ekrana ekle" veya "Uygulamayı yükle" seçeneğini seç.';
  }
  return 'Tarayıcı menüsünden bu siteyi ana ekrana ekleyebilirsin.';
}

// Kart alt metni — otomatik kurulum varsa kısa, yoksa adım adım
export function getInstallCardHint(hasNativePrompt) {
  if (hasNativePrompt) {
    return 'Tek dokunuşla ana ekrana ekle, QR ve kampanyalara hızlı ulaş.';
  }
  return getInstallHelpText();
}

// Ana ekrana ekle kartı gösterilsin mi?
export function shouldShowInstallCard(isNative = false) {
  if (isNative) return false;
  return !isStandalonePwa();
}

// Tarayıcı kurulum penceresini aç
export async function requestPwaInstall() {
  if (!deferredPrompt) {
    return { ok: false, outcome: 'unavailable' };
  }

  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  const accepted = choice?.outcome === 'accepted';

  if (accepted) {
    clearDeferredPwaPrompt();
  }

  return { ok: accepted, outcome: choice?.outcome || 'dismissed' };
}
