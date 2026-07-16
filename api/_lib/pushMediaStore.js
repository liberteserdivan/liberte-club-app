import { randomUUID } from 'crypto';
import { isProductionRuntime } from './schemaReady.js';

const MAX_BYTES = 450 * 1024;

let tableReady = false;

function ensureHttpsUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  return { mime, buffer };
}

// Geliştirmede tabloyu hazırla — production bootstrap SQL kullanır
async function ensurePushMediaTable(sql) {
  if (tableReady || !sql) return;
  if (isProductionRuntime()) {
    tableReady = true;
    return;
  }
  await sql`
    CREATE TABLE IF NOT EXISTS push_media_assets (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      bytes BYTEA NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  tableReady = true;
}

// Data URL yükle; public medya id döndür
export async function savePushMediaFromDataUrl(sql, dataUrl) {
  if (!sql) {
    const err = new Error('Görsel kaydı için veritabanı hazır değil');
    err.statusCode = 503;
    throw err;
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    const err = new Error('Geçersiz veya çok büyük görsel (max ~450KB)');
    err.statusCode = 400;
    throw err;
  }

  await ensurePushMediaTable(sql);
  const id = randomUUID();
  try {
    await sql`
      INSERT INTO push_media_assets (id, mime_type, bytes, byte_size)
      VALUES (${id}, ${parsed.mime}, ${parsed.buffer}, ${parsed.buffer.length})
    `;
  } catch (error) {
    const msg = String(error?.message || '');
    if (msg.includes('push_media_assets') || msg.includes('does not exist')) {
      const err = new Error('Görsel tablosu henüz kurulmadı. Yöneticiye bildirin.');
      err.statusCode = 503;
      throw err;
    }
    throw error;
  }
  return id;
}

// Medya kaydını oku
export async function loadPushMedia(sql, id) {
  const mediaId = String(id || '').trim();
  if (!mediaId || !sql) return null;
  await ensurePushMediaTable(sql);
  try {
    const rows = await sql`
      SELECT id, mime_type, bytes
      FROM push_media_assets
      WHERE id = ${mediaId}
      LIMIT 1
    `;
    return rows[0] || null;
  } catch (error) {
    const msg = String(error?.message || '');
    if (msg.includes('push_media_assets') || msg.includes('does not exist')) {
      return null;
    }
    throw error;
  }
}

// İstek gövdesinden geçerli görsel URL veya yükleme sonucu üret
export async function resolvePushImageUrl(sql, { imageUrl, imageDataUrl, publicOrigin }) {
  const external = ensureHttpsUrl(imageUrl);
  if (external) return external;

  const dataUrl = String(imageDataUrl || '').trim();
  if (!dataUrl) return '';

  const id = await savePushMediaFromDataUrl(sql, dataUrl);
  const origin = String(publicOrigin || '').replace(/\/$/, '');
  if (!origin) {
    const err = new Error('Görsel URL üretilemedi');
    err.statusCode = 500;
    throw err;
  }
  return `${origin}/api/media?id=${encodeURIComponent(id)}`;
}

export function normalizeIconUrl(iconUrl, fallbackOrigin) {
  const external = ensureHttpsUrl(iconUrl);
  if (external) return external;
  const origin = String(fallbackOrigin || '').replace(/\/$/, '');
  return origin ? `${origin}/icon-192.png?v=8` : 'https://app.liberte.cafe/icon-192.png?v=8';
}
