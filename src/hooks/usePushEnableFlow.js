import { useCallback, useEffect, useState } from 'react';
import { tryEnablePush, resetPushCircuit } from '../lib/firebasePush.js';
import { openNotificationSettings } from '../lib/openNotificationSettings.js';
import { getPushSettingsHint } from '../lib/nativePush.js';
import { canRequestPushOnThisDevice } from '../lib/pushPrompt.js';
import { isNativeApp } from '../lib/platform.js';

// Bildirim açma akışı — ayarlara yönlendirme ve otomatik yeniden deneme
export function usePushEnableFlow(customer, db, commit) {
  const [needsSettings, setNeedsSettings] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const attemptEnable = useCallback(async () => {
    if (!customer?.id) {
      return { ok: false, needsSettings: false };
    }

    if (!canRequestPushOnThisDevice()) {
      setStatusMessage(
        'iPhone\'da bildirimler için önce Safari paylaş menüsünden "Ana Ekrana Ekle" yapmalısın. Uygulamayı ana ekrandan açınca Bildirimleri Aç seçeneği görünür.'
      );
      return { ok: false, needsSettings: false };
    }

    setBusy(true);
    setStatusMessage('');
    resetPushCircuit();

    const result = await tryEnablePush(customer, db, commit);
    setBusy(false);

    if (result.ok) {
      setNeedsSettings(false);
      setStatusMessage('');
      return result;
    }

    if (result.needsSettings && isNativeApp()) {
      setNeedsSettings(true);
      setStatusMessage('Bildirimler kapalı. Ayarlardan aç, sonra tekrar dene.');
      return result;
    }

    setNeedsSettings(false);
    setStatusMessage(result.message || 'Bildirimler açılamadı.');
    return result;
  }, [customer, db, commit]);

  const openSettings = useCallback(async () => {
    const opened = await openNotificationSettings();
    if (!opened) {
      setStatusMessage(getPushSettingsHint());
    }
  }, []);

  // Ayarlardan dönünce otomatik yeniden dene
  useEffect(() => {
    if (!needsSettings || !isNativeApp()) return undefined;

    let appListener = null;

    async function attachResumeListener() {
      try {
        const { App } = await import('@capacitor/app');
        appListener = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) attemptEnable();
        });
      } catch {
        // Eski build'de App eklentisi yoksa sessizce geç
      }
    }

    attachResumeListener();

    return () => {
      appListener?.remove?.();
    };
  }, [needsSettings, attemptEnable]);

  return {
    needsSettings,
    statusMessage,
    busy,
    attemptEnable,
    openSettings
  };
}
