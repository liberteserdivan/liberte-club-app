import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SPLASH_IMAGE } from '../lib/constants.js';

// Soğuk açılış — tek tam ekran görsel (native splash ile birebir)
export default function AppSplash({ phase = 'visible', onImageReady }) {
  useEffect(() => {
    if (phase === 'hidden') return undefined;

    const img = new Image();
    img.src = SPLASH_IMAGE;
    img.onload = () => onImageReady?.();
    img.onerror = () => onImageReady?.();

    return undefined;
  }, [phase, onImageReady]);

  if (phase === 'hidden') return null;

  return createPortal(
    <div className={`appSplash appSplash--full${phase === 'fade' ? ' appSplash--fade' : ''}`} aria-hidden="true">
      <img
        className="appSplashImage"
        src={SPLASH_IMAGE}
        alt=""
        decoding="sync"
        fetchPriority="high"
        onLoad={() => onImageReady?.()}
        onError={() => onImageReady?.()}
      />
    </div>,
    document.body
  );
}
