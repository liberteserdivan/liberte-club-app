import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { isNativeApp } from './platform.js';

// Native cihazda ML Kit destekleniyor mu?
// Not: iOS SPM projelerinde eklenti bağlanmaz; WebView tarayıcısına düşer.
export async function canUseNativeBarcodeScan() {
  if (!isNativeApp()) return false;

  try {
    const { supported } = await BarcodeScanner.isSupported();
    return Boolean(supported);
  } catch {
    return false;
  }
}

// Android Play Services — Google Code Scanner modülü
async function ensureGoogleScannerModule() {
  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (available) return true;

    await BarcodeScanner.installGoogleBarcodeScannerModule();
    const check = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    return Boolean(check.available);
  } catch {
    return false;
  }
}

// Native tam ekran QR okuma — WebView kamerasına gerek yok
export async function scanQrWithNativeCamera() {
  const supported = await canUseNativeBarcodeScan();
  if (!supported) {
    throw new Error('Bu cihazda native QR okuma desteklenmiyor.');
  }

  const { camera } = await BarcodeScanner.requestPermissions();
  if (camera !== 'granted' && camera !== 'limited') {
    throw new Error('Kamera izni kapalı. Ayarlardan Liberte için kamerayı aç.');
  }

  const googleModuleReady = await ensureGoogleScannerModule();
  if (!googleModuleReady && camera !== 'granted' && camera !== 'limited') {
    throw new Error('Kamera izni kapalı. Ayarlardan Liberte için kamerayı aç.');
  }

  const { barcodes } = await BarcodeScanner.scan({
    formats: [BarcodeFormat.QrCode]
  });

  const rawValue = barcodes?.[0]?.rawValue || barcodes?.[0]?.displayValue || '';
  if (!rawValue) {
    throw new Error('QR okunamadı. Tekrar dene.');
  }

  return rawValue;
}
