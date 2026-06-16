import { Html5Qrcode } from 'html5-qrcode';
import { ensureAndroidCameraPermission } from './androidCameraPermission.js';
import { isAndroid, isNativeApp } from './platform.js';

const SCAN_OPTIONS = { fps: 12, aspectRatio: 1, disableFlip: false };

// QR kutusu — ekranın %72'si
function buildQrBox() {
  return (viewWidth, viewHeight) => {
    const size = Math.floor(Math.min(viewWidth, viewHeight) * 0.72);
    return { width: size, height: size };
  };
}

// Kamera adaylarını sırayla dene
const CAMERA_CANDIDATES = [
  { facingMode: { exact: 'environment' } },
  { facingMode: 'environment' },
  { facingMode: 'user' }
];

// Android WebView — izin sonrası kısa bekleme
function waitForCameraReady() {
  if (!isNativeApp() || !isAndroid()) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, 350);
  });
}

// Html5Qrcode ile kamera başlat — birden fazla profil dener
async function startHtml5Camera(scanner, onDecoded) {
  const qrbox = buildQrBox();
  let lastError = null;

  for (const cameraConfig of CAMERA_CANDIDATES) {
    try {
      await scanner.start(
        cameraConfig,
        { ...SCAN_OPTIONS, qrbox },
        (decoded) => { onDecoded(decoded); }
      );
      return;
    } catch (error) {
      lastError = error;
    }
  }

  // Son çare — cihaz listesinden arka kamera
  try {
    const cameras = await Html5Qrcode.getCameras();
    const backCam = cameras?.find((c) => /back|rear|environment|arka/i.test(c.label || ''));
    const cameraId = backCam?.id || cameras?.[0]?.id;
    if (!cameraId) throw lastError || new Error('Kamera bulunamadı');

    await scanner.start(
      cameraId,
      { ...SCAN_OPTIONS, qrbox },
      (decoded) => { onDecoded(decoded); }
    );
    return;
  } catch (error) {
    throw error || lastError || new Error('Kamera açılamadı');
  }
}

// Web / PWA — Html5Qrcode tarayıcısını başlat
export async function bootInlineQrScanner({ elementId, onDecoded }) {
  const cameraPermission = await ensureAndroidCameraPermission();
  if (!cameraPermission.ok) {
    throw new Error(cameraPermission.message || 'Kamera izni verilmedi.');
  }

  await waitForCameraReady();

  const scanner = new Html5Qrcode(elementId);
  await startHtml5Camera(scanner, onDecoded);
  return scanner;
}
