// Merkezi hata yönetimi — toast, sunucu logu, geliştirici konsolu

import { isAndroid, isIos, isNativeApp } from './platform.js';
import { useLocalAuth } from './devAuth.js';
import { submitErrorLog } from './errorLogClient.js';

const listeners = new Set();
const MAX_TOAST_QUEUE = 5;

let toastQueue = [];

// Toast dinleyicisi ekle
export function subscribeErrorHub(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Mevcut toast kuyruğunu oku
export function getErrorToastQueue() {
  return toastQueue;
}

// Platform etiketi
function detectPlatform() {
  if (isNativeApp() && isAndroid()) return 'android-native';
  if (isNativeApp() && isIos()) return 'ios-native';
  if (isAndroid()) return 'android-web';
  if (isIos()) return 'ios-web';
  return 'web';
}

// Dinleyicilere bildir
function emitToast(entry) {
  toastQueue = [...toastQueue, entry].slice(-MAX_TOAST_QUEUE);
  listeners.forEach((fn) => {
    try {
      fn(toastQueue);
    } catch {
      // Dinleyici hatası uygulamayı durdurmasın
    }
  });
}

// Toast kuyruğundan tek kayıt kaldır
export function dismissErrorToast(id) {
  toastQueue = toastQueue.filter((row) => row.id !== id);
  listeners.forEach((fn) => {
    try {
      fn(toastQueue);
    } catch {
      // Sessizce geç
    }
  });
}

/**
 * Merkezi hata bildirimi
 * @param {object} options
 * @param {string} options.message — teknik / log mesajı
 * @param {string} [options.userMessage] — kullanıcıya gösterilen metin
 * @param {string} [options.source] — kaynak modül (sync, auth, push, ...)
 * @param {'error'|'warn'|'info'} [options.level]
 * @param {string} [options.code]
 * @param {object} [options.detail]
 * @param {boolean} [options.showToast=true]
 * @param {boolean} [options.persist=true]
 */
export function reportError({
  message,
  userMessage,
  source = 'app',
  level = 'error',
  code = '',
  detail = null,
  showToast = true,
  persist = true
}) {
  const safeMessage = String(message || userMessage || 'Bilinmeyen hata');
  const safeUserMessage = String(userMessage || safeMessage);
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    source,
    message: safeMessage,
    userMessage: safeUserMessage,
    code,
    createdAt: Date.now()
  };

  if (import.meta.env.DEV) {
    const logFn = level === 'warn' ? console.warn : level === 'info' ? console.info : console.error;
    logFn(`[${source}]`, safeMessage, detail || '');
  }

  if (showToast && (level !== 'info' || String(source).startsWith('realtime.'))) {
    emitToast(entry);
  }

  if (persist && !useLocalAuth()) {
    submitErrorLog({
      level,
      source,
      message: safeMessage,
      userMessage: safeUserMessage,
      code,
      detail,
      platform: detectPlatform()
    }).catch(() => {
      // Log gönderimi başarısız olsa akış devam etsin
    });
  }

  return entry;
}

// API yanıt hatasını standart biçimde işle
export function reportApiError({
  source,
  response,
  data = {},
  userMessage,
  level = 'error',
  showToast = true
}) {
  const status = response?.status || 0;
  const message = data?.error || userMessage || `API hatası (${status})`;
  return reportError({
    source,
    message,
    userMessage: userMessage || message,
    level,
    code: data?.fields ? 'validation' : `http_${status}`,
    detail: { status, fields: data?.fields || null },
    showToast
  });
}

// Beklenmeyen exception yakalama
export function captureException(error, source = 'app', userMessage = 'Beklenmeyen bir hata oluştu.') {
  return reportError({
    source,
    message: error?.message || String(error),
    userMessage,
    detail: { stack: error?.stack ? String(error.stack).slice(0, 1200) : null },
    level: 'error',
    showToast: true,
    persist: true
  });
}
