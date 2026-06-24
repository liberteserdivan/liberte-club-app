// API hata mesajlarını kullanıcıya uygun ve Ref'li metne çevir

function withRef(message, requestId) {
  const base = String(message || '').trim();
  if (!requestId) return base;
  if (base.includes('Ref:')) return base;
  return `${base} Ref: ${requestId}`;
}

// İstemci tarafı API hata formatı
export function formatClientApiError({ response = null, data = {}, error = null, fallback = 'İşlem tamamlanamadı.' } = {}) {
  if (error?.name === 'AbortError') {
    return { message: '', code: 'ABORTED', requestId: null, abort: true };
  }

  const requestId = data?.requestId || error?.requestId || null;
  const httpStatus = response?.status ?? error?.httpStatus ?? null;
  const code = data?.code || error?.code || null;

  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine) {
    return { message: 'Bağlantı yok.', code: 'OFFLINE', requestId, abort: false };
  }

  if (error?.code === 'FETCH_TIMEOUT' || code === 'FETCH_TIMEOUT') {
    return { message: withRef('Sunucuya ulaşılamadı.', requestId), code: 'FETCH_TIMEOUT', requestId, abort: false };
  }

  if (error?.code === 'REMOTE_BACKOFF') {
    return { message: withRef(error.message || 'Sunucu geçici olarak meşgul. Biraz sonra tekrar dene.', requestId), code: 'REMOTE_BACKOFF', requestId, abort: false };
  }

  if (httpStatus === 401) {
    return {
      message: withRef(data?.message || 'Oturum süresi doldu. Lütfen tekrar giriş yap.', requestId),
      code: code || 'SESSION_REQUIRED',
      requestId,
      abort: false
    };
  }

  if (httpStatus === 403) {
    return {
      message: withRef(data?.message || data?.error || 'Bu işlem için yetkin yok.', requestId),
      code: code || 'FORBIDDEN',
      requestId,
      abort: false
    };
  }

  if (httpStatus === 404) {
    return {
      message: withRef(data?.message || 'Servis bulunamadı.', requestId),
      code: code || 'NOT_FOUND',
      requestId,
      abort: false
    };
  }

  if (httpStatus === 409) {
    return {
      message: withRef(data?.message || 'Bu kayıt zaten var.', requestId),
      code: code || 'CONFLICT',
      requestId,
      abort: false
    };
  }

  if (httpStatus >= 500) {
    if (code === 'DATABASE_TRANSIENT') {
      return {
        message: withRef(data?.message || 'Sunucu geçici olarak yanıt veremedi. Birkaç saniye sonra tekrar deneyin.', requestId),
        code: 'DATABASE_TRANSIENT',
        requestId,
        abort: false,
        retryable: true
      };
    }
    const raw = String(data?.message || data?.error || '');
    if (/connection_closed|edbhandlerexited|pooler\.supabase/i.test(raw)) {
      return {
        message: withRef('Sunucu geçici olarak yanıt veremedi. Birkaç saniye sonra tekrar deneyin.', requestId),
        code: 'DATABASE_TRANSIENT',
        requestId,
        abort: false,
        retryable: true
      };
    }
    return {
      message: withRef(data?.message || data?.error || 'İşlem tamamlanamadı.', requestId),
      code: code || 'SERVER_ERROR',
      requestId,
      abort: false
    };
  }

  if (data?.ok === false || (response && !response.ok)) {
    return {
      message: withRef(data?.message || data?.error || fallback, requestId),
      code: code || 'API_ERROR',
      requestId,
      abort: false
    };
  }

  const raw = String(error?.message || '');
  if (
    raw.includes('Failed to fetch')
    || raw.includes('Load failed')
    || raw.includes('bağlan')
  ) {
    return { message: withRef('Sunucuya ulaşılamadı.', requestId), code: 'NETWORK_ERROR', requestId, abort: false };
  }

  return {
    message: withRef(raw || fallback, requestId),
    code: code || 'UNKNOWN',
    requestId,
    abort: false
  };
}
