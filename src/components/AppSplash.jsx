import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SPLASH_LOGO, CLUB_APP_NAME, BRAND_SLOGAN } from '../lib/constants.js';

// Soğuk açılış — referans tasarım: yeşil zemin, daire rozet, Liberte Club metinleri
export default function AppSplash({ phase = 'visible', onImageReady }) {
  useEffect(() => {
    if (phase === 'hidden') return undefined;

    const img = new Image();
    img.src = SPLASH_LOGO;
    img.onload = () => onImageReady?.();
    img.onerror = () => onImageReady?.();

    return undefined;
  }, [phase, onImageReady]);

  if (phase === 'hidden') return null;

  return createPortal(
    <div className={`appSplash${phase === 'fade' ? ' appSplash--fade' : ''}`} aria-hidden="true">
      <div className="appSplashOrb appSplashOrb--mint" />
      <div className="appSplashOrb appSplashOrb--gold" />
      <div className="appSplashCore">
        <div className="appSplashLogoWrap">
          <img
            className="appSplashLogo"
            src={SPLASH_LOGO}
            alt=""
            decoding="sync"
            fetchPriority="high"
            onLoad={() => onImageReady?.()}
            onError={() => onImageReady?.()}
          />
        </div>
        <p className="appSplashTag">{CLUB_APP_NAME}</p>
        <span className="appSplashSub">GASTRO CAFE</span>
        <p className="appSplashSlogan">{BRAND_SLOGAN}</p>
      </div>
    </div>,
    document.body
  );
}
