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
import { scheduleNativeSplashHide } from './lib/nativeSplash.js';
import './style.css';

// Herkese acik yasal sayfalar — giris ve splash olmadan
const legalRoute = resolveLegalRoute(window.location.pathname);
patchFirebaseReferrer(getFirebaseReferrerOrigin());
// PWA kurulum istemini React'tan önce yakala
if (!legalRoute) {
  initPwaInstallCapture();
  scheduleNativeSplashHide();
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

mountApp();
