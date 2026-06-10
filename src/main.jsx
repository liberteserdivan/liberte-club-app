import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import LegalPublicPage from './pages/LegalPublicPage.jsx';
import { resolveLegalRoute } from './lib/legalRoutes.js';
import { patchFirebaseReferrer } from './lib/firebaseReferrerPatch.js';
import { getFirebaseReferrerOrigin } from './lib/firebasePush.js';
import { initPwaInstallCapture } from './lib/pwaInstall.js';
import { scheduleNativeSplashHide } from './lib/nativeSplash.js';
import './style.css';

// Herkese acik yasal sayfalar — giris ve splash olmadan
const legalRoute = resolveLegalRoute(window.location.pathname);

// Firebase Google API isteklerine referrer ekle (push / installations)
patchFirebaseReferrer(getFirebaseReferrerOrigin());
// PWA kurulum istemini React'tan önce yakala
if (!legalRoute) initPwaInstallCapture();
// Native splash takılmasını önle — yasal sayfalarda gerekmez
if (!legalRoute) scheduleNativeSplashHide();

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
  legalRoute ? (
    <LegalPublicPage type={legalRoute} />
  ) : (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
);
