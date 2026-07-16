import { useEffect, useState } from 'react';
import { isNativeAppActive, subscribeActiveChange } from '../lib/appForeground.js';

// Sayfa şu an aktif (görünür + native ön planda) mı?
// Web: document.visibilityState; Native: appStateChange köprüsü.
function computePageActive() {
  const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
  return visible && isNativeAppActive();
}

// Polling'leri arka planda/gizliyken durdurmak için tek kaynak.
export function usePageActive() {
  const [active, setActive] = useState(computePageActive);

  useEffect(() => {
    function update() {
      setActive(computePageActive());
    }

    document.addEventListener('visibilitychange', update);
    const unsubscribe = subscribeActiveChange(update);

    return () => {
      document.removeEventListener('visibilitychange', update);
      unsubscribe();
    };
  }, []);

  return active;
}
