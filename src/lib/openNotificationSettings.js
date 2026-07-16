import { registerPlugin } from '@capacitor/core';
import { isAndroid, isIos, isNativeApp } from './platform.js';

const LiberteNotifications = registerPlugin('LiberteNotifications');

// Telefon bildirim ayarlarını doğrudan aç
export async function openNotificationSettings() {
  if (!isNativeApp()) return false;

  if (isAndroid()) {
    try {
      await LiberteNotifications.openSettings();
      return true;
    } catch {
      // Eski APK'da native eklenti yok — uygulama detay ekranına düş
      try {
        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        await App.openUrl({ url: `package:${info.id}` });
        return true;
      } catch {
        return false;
      }
    }
  }

  if (isIos()) {
    try {
      const { App } = await import('@capacitor/app');
      await App.openUrl({ url: 'app-settings:' });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
