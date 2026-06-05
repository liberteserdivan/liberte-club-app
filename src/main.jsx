import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { patchFirebaseReferrer } from './lib/firebaseReferrerPatch.js';
import { initPwaInstallCapture } from './lib/pwaInstall.js';
import './style.css';

// Firebase Google API isteklerine referrer ekle (push / installations)
patchFirebaseReferrer();
// PWA kurulum istemini React'tan önce yakala
initPwaInstallCapture();

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
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
