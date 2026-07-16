import { useEffect, useRef, useState } from 'react';
import { CUP_MODEL, CUP_STATIC_IMAGE, DEFAULT_LOGO } from '../lib/constants.js';

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

// Statik bardak görseli — 3D yüklenemezse
function StaticCupPreview() {
  return (
    <div className="loyaltyCupStatic" aria-hidden="true">
      <img src={CUP_STATIC_IMAGE} alt="" onError={(e) => { e.currentTarget.src = DEFAULT_LOGO; }} />
    </div>
  );
}

// GLB bardak — isteğe bağlı 3D mod
export default function LoyaltyCupModel() {
  const hostRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (failed) return;

    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;

    async function mountCup() {
      try {
        await Promise.race([
          loadModelViewer(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
        ]);
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }

      if (cancelled || !hostRef.current) return;

      const viewer = document.createElement('model-viewer');
      viewer.className = 'loyaltyCupModel';
      viewer.alt = '';
      viewer.src = CUP_MODEL;
      viewer.setAttribute('camera-orbit', '0deg 82deg 120%');
      viewer.setAttribute('field-of-view', '22deg');
      viewer.setAttribute('interaction-prompt', 'none');
      viewer.setAttribute('disable-zoom', '');
      viewer.setAttribute('loading', 'eager');
      viewer.setAttribute('aria-hidden', 'true');
      viewer.addEventListener('load', () => { if (!cancelled) setReady(true); });
      viewer.addEventListener('error', () => setFailed(true));
      hostRef.current.appendChild(viewer);
    }

    mountCup();
    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [failed]);

  if (failed) return <StaticCupPreview />;

  return (
    <div className={`loyaltyCupScene${ready ? ' isReady' : ''}`} ref={hostRef} aria-hidden="true">
      {!ready && <StaticCupPreview />}
    </div>
  );
}
