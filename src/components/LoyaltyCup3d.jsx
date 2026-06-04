import { useEffect, useRef, useState } from 'react';
import { CUP_MODEL, DEFAULT_LOGO } from '../lib/constants.js';

const VIEWER_SCRIPT = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js';

// model-viewer scriptini yükle
function loadModelViewer() {
  if (customElements.get('model-viewer')) {
    return Promise.resolve();
  }

  const existing = document.querySelector('script[data-cup-viewer]');
  if (existing) {
    return customElements.whenDefined('model-viewer');
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = VIEWER_SCRIPT;
    script.dataset.cupViewer = '1';
    script.onload = () => customElements.whenDefined('model-viewer').then(resolve);
    script.onerror = () => reject(new Error('model-viewer yüklenemedi'));
    document.head.appendChild(script);
  });
}

// Dokulu GLB bardak — halka ortasında döner
export default function LoyaltyCup3d() {
  const hostRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed) return;

    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let viewer = null;

    async function mountCup() {
      try {
        await Promise.race([
          loadModelViewer(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
        ]);
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }

      if (cancelled || !hostRef.current) return;

      viewer = document.createElement('model-viewer');
      viewer.className = 'loyaltyCupModel';
      viewer.alt = '';
      viewer.src = CUP_MODEL;

      viewer.setAttribute('auto-rotate', '');
      viewer.setAttribute('rotation-per-second', '28deg');
      viewer.setAttribute('camera-orbit', '22deg 78deg 110%');
      viewer.setAttribute('min-camera-orbit', 'auto 62deg 95%');
      viewer.setAttribute('max-camera-orbit', 'auto 92deg 140%');
      viewer.setAttribute('field-of-view', '22deg');
      viewer.setAttribute('interaction-prompt', 'none');
      viewer.setAttribute('disable-zoom', '');
      viewer.setAttribute('touch-action', 'none');
      viewer.setAttribute('tone-mapping', 'commerce');
      viewer.setAttribute('exposure', '1.15');
      viewer.setAttribute('shadow-intensity', '0.85');
      viewer.setAttribute('environment-image', 'neutral');
      viewer.setAttribute('loading', 'eager');
      viewer.setAttribute('reveal', 'auto');
      viewer.setAttribute('aria-hidden', 'true');

      viewer.addEventListener('error', () => setFailed(true));
      hostRef.current.appendChild(viewer);
    }

    mountCup();

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [failed]);

  if (failed) {
    return (
      <div className="loyaltyRingMark" aria-hidden="true">
        <img src={DEFAULT_LOGO} alt="" />
      </div>
    );
  }

  return <div className="loyaltyCupScene" ref={hostRef} aria-hidden="true" />;
}
