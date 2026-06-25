import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { ensureAndroidCameraPermission } from './androidCameraPermission.js';
import { isAndroid, isIos, isNativeApp } from './platform.js';

const QR_ONLY = [Html5QrcodeSupportedFormats.QR_CODE];

// Platforma göre tarama ayarları — iOS WebView daha yüksek fps ve tek format
function buildScanOptions() {
  const iosNative = isNativeApp() && isIos();
  return {
    fps: iosNative ? 12 : 15,
    aspectRatio: 1,
    disableFlip: iosNative,
    formatsToSupport: QR_ONLY,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }
  };
}

// QR kutusu — iOS'ta daha geniş alan
function buildQrBox() {
  const ratio = isNativeApp() && isIos() ? 0.9 : 0.78;
  return (viewWidth, viewHeight) => {
    const size = Math.floor(Math.min(viewWidth, viewHeight) * ratio);
    return { width: size, height: size };
  };
}

// iOS — önce environment + sürekli odak
const IOS_CAMERA_CANDIDATES = [
  { facingMode: { ideal: 'environment' } },
  { facingMode: 'environment' },
  { facingMode: 'user' }
];

// Android / web kamera adayları
const DEFAULT_CAMERA_CANDIDATES = [
  { facingMode: { exact: 'environment' } },
  { facingMode: 'environment' },
  { facingMode: 'user' }
];

function getCameraCandidates() {
  return isNativeApp() && isIos() ? IOS_CAMERA_CANDIDATES : DEFAULT_CAMERA_CANDIDATES;
}

// Native WebView — kamera hazır olana kadar bekle
function waitForCameraReady() {
  if (!isNativeApp()) return Promise.resolve();
  const delayMs = isIos() ? 500 : isAndroid() ? 350 : 0;
  if (!delayMs) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

// iOS — çözünürlük ve odak iyileştirmesi
async function tuneIosInlineScanner(scanner) {
  if (!isNativeApp() || !isIos() || typeof scanner?.applyVideoConstraints !== 'function') return;

  try {
    await scanner.applyVideoConstraints({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      advanced: [{ focusMode: 'continuous' }]
    });
  } catch {
    // Cihaz kısıtlıysa varsayılan akışla devam et
  }
}

// Flaş desteği var mı?
export function inlineScannerSupportsTorch(scanner) {
  try {
    const caps = scanner?.getRunningTrackCameraCapabilities?.() || {};
    return Boolean(caps.torch);
  } catch {
    return false;
  }
}

// Satır içi tarayıcıda flaşı aç/kapat
export async function setInlineScannerTorch(scanner, enabled) {
  if (typeof scanner?.applyVideoConstraints !== 'function') return false;

  try {
    await scanner.applyVideoConstraints({ advanced: [{ torch: Boolean(enabled) }] });
    return true;
  } catch {
    return false;
  }
}

// Html5Qrcode ile kamera başlat — birden fazla profil dener
async function startHtml5Camera(scanner, onDecoded) {
  const scanOptions = buildScanOptions();
  const qrbox = buildQrBox();
  const cameraCandidates = getCameraCandidates();
  let lastError = null;

  for (const cameraConfig of cameraCandidates) {
    try {
      await scanner.start(
        cameraConfig,
        { ...scanOptions, qrbox },
        (decoded) => { onDecoded(decoded); }
      );
      await tuneIosInlineScanner(scanner);
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
      { ...scanOptions, qrbox },
      (decoded) => { onDecoded(decoded); }
    );
    await tuneIosInlineScanner(scanner);
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
