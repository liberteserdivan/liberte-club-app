// Push görselini FCM limitine uygun sıkıştır (max ~450KB data URL)
const MAX_EDGE = 1280;
const MAX_BYTES = 450 * 1024;
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42];

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Görsel okunamadı'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Görsel dönüştürülemedi'));
    reader.readAsDataURL(blob);
  });
}

// Dosyayı JPEG data URL'e çevir
export async function compressPushImage(file) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Sadece görsel dosyası seçilebilir');
  }

  const image = await loadImageFromFile(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, width, height);

  for (const quality of QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, quality);
    if (!blob) continue;
    if (blob.size <= MAX_BYTES) {
      return blobToDataUrl(blob);
    }
  }

  const fallback = await canvasToBlob(canvas, 0.35);
  if (!fallback || fallback.size > MAX_BYTES) {
    throw new Error('Görsel çok büyük; daha küçük bir dosya seçin');
  }
  return blobToDataUrl(fallback);
}

export function isHttpsImageUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
