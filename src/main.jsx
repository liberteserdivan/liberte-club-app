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
import './style.css';

// Herkese acik yasal sayfalar — giris ve splash olmadan
const legalRoute = resolveLegalRoute(window.location.pathname);

// Firebase Google API isteklerine referrer ekle (push / installations)
patchFirebaseReferrer(getFirebaseReferrerOrigin());
// PWA kurulum istemini React'tan önce yakala
if (!legalRoute) initPwaInstallCapture();
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

createRoot(document.getElementById('root')).render(
  legalRoute === 'support' ? (
    <SupportPublicPage />
  ) : legalRoute ? (
    <LegalPublicPage type={legalRoute} />
  ) : (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
);
