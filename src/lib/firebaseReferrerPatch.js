const GOOGLE_API_HOSTS = [
  'firebaseinstallations.googleapis.com',
  'fcmregistrations.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com'
];

// Google Firebase isteği mi kontrol et
function isGoogleFirebaseRequest(url) {
  try {
    const host = new URL(url).hostname;
    return GOOGLE_API_HOSTS.includes(host) || host.endsWith('.googleapis.com');
  } catch {
    return false;
  }
}

// Referrer kısıtlı API key ile Firebase isteklerine origin ekle
export function patchFirebaseReferrer(origin = window.location.origin) {
  if (typeof window === 'undefined' || window.__liberteFirebaseReferrerPatched) return;
  window.__liberteFirebaseReferrerPatched = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!isGoogleFirebaseRequest(url)) return nativeFetch(input, init);

    const referrer = `${origin}/`;
    const options = {
      ...init,
      referrer,
      referrerPolicy: 'strict-origin'
    };

    if (input instanceof Request) {
      return nativeFetch(new Request(input, options));
    }

    return nativeFetch(input, options);
  };
}
