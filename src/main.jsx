import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import LegalPublicPage from './pages/LegalPublicPage.jsx';
import SupportPublicPage from './pages/SupportPublicPage.jsx';
import { resolveLegalRoute } from './lib/legalRoutes.js';
import { captureException } from './lib/errorHub.js';
import { patchFirebaseReferrer } from './lib/firebaseReferrerPatch.js';
import { getFirebaseReferrerOrigin } from './lib/firebasePush.js';
import { initPwaInstallCapture } from './lib/pwaInstall.js';
import { ensureNativePushNavigation } from './lib/nativePush.js';
import { handlePushOpenPayload } from './lib/pushNavigation.js';
import { isNativeApp } from './lib/platform.js';
import { initNativeForegroundBridge, subscribeForegroundResume } from './lib/appForeground.js';
import { warmServer, warmDatabasePool } from './lib/serverWarmup.js';
import { load } from './lib/db.js';
import { bootstrapDevAuth } from './lib/devAuth.js';
import './style.css';

// Herkese acik yasal sayfalar — giris ve splash olmadan
const legalRoute = resolveLegalRoute(window.location.pathname);
patchFirebaseReferrer(getFirebaseReferrerOrigin());
if (isNativeApp()) {
  ensureNativePushNavigation();
  initNativeForegroundBridge();
}
// Sunucuyu olabildiğince erken ısıt — soğuk başlatma gecikmesini gizle.
// Yasal sayfalar API kullanmaz; orada ısınmaya gerek yok.
if (!legalRoute) {
  warmServer({ force: true });
  // DB havuzunu sırayla ısıt — giriş/state istekleri soğuk bağlantı beklemesin
  setTimeout(() => warmDatabasePool({ force: true }), 400);
  subscribeForegroundResume(() => {
    warmServer();
    warmDatabasePool();
  });
}
// PWA kurulum istemini React'tan önce yakala
if (!legalRoute) {
  initPwaInstallCapture();
}
// PWA bildirim tıklaması — açık sekmede route değiştir
if (!legalRoute && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'liberte-push-open') {
      handlePushOpenPayload(event.data.data || {});
    }
  });
}
// Yakalanmamış istemci hatalarını merkezi hub'a ilet
if (!legalRoute) {
  window.addEventListener('error', (event) => {
    captureException(
      event.error || new Error(event.message || 'window.error'),
      'window.error',
      'Beklenmeyen bir hata oluştu.'
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    // Arka plan sync / iptal — kullanıcıya toast gösterme
    if (
      reason?.name === 'AbortError'
      || reason?.code === 'FETCH_TIMEOUT'
      || reason?.code === 'NETWORK_ERROR'
    ) {
      event.preventDefault();
      return;
    }
    captureException(
      reason instanceof Error ? reason : new Error(String(reason)),
      'window.unhandledrejection',
      'İşlem tamamlanamadı.'
    );
  });
}

// Geliştirmede eski önbellek SW'lerini temizle — push SW'sine dokunma
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => {
      if (!reg.active?.scriptURL?.includes('firebase-messaging-sw')) {
        reg.unregister();
      }
    });
  });
}

// React kök mount — hata olursa boş ekran yerine mesaj göster
function mountApp() {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;

  const tree = legalRoute === 'support' ? (
    <SupportPublicPage />
  ) : legalRoute ? (
    <LegalPublicPage type={legalRoute} />
  ) : (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );

  try {
    createRoot(rootEl).render(tree);
  } catch (error) {
    captureException(
      error instanceof Error ? error : new Error(String(error)),
      'boot.mount',
      'Uygulama başlatılamadı.'
    );
    rootEl.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,sans-serif;background:#FBF6EE;color:#0B2F26;text-align:center"><div><h1 style="margin:0 0 12px">Başlatılamadı</h1><p style="margin:0 0 16px;color:#75827C">Uygulamayı kapatıp tekrar açmayı dene.</p><button type="button" onclick="location.reload()" style="padding:12px 18px;border:0;border-radius:12px;background:#0B2F26;color:#fff;font-weight:700">Yeniden dene</button></div></main>';
  }
}

async function boot() {
  if (import.meta.env.DEV) {
    const db = load();
    await bootstrapDevAuth(db.customers || []);
  }
  mountApp();
}

boot();
