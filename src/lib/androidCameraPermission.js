import { registerPlugin } from '@capacitor/core';
import { isAndroid, isNativeApp } from './platform.js';

const LiberteCamera = registerPlugin('LiberteCamera');

// Android native — QR tarama öncesi kamera izni
export async function ensureAndroidCameraPermission() {
  if (!isNativeApp() || !isAndroid()) {
    return { ok: true };
  }

  try {
    await LiberteCamera.requestPermission();
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'Kamera izni kapalı. Ayarlar → Uygulamalar → Liberte → İzinler → Kamera yolunu izleyerek açabilirsin.'
    };
  }
}
