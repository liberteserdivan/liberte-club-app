import { handlePushRegisterDevice } from './_lib/handlers/pushRegisterDevice.js';
import { handleAdminPushSend } from './_lib/handlers/adminPushSend.js';
import { withSqlRequest, withSqlRequestNoGuardian } from './_lib/sqlRequest.js';
import { getSql } from './_lib/sql.js';
import { loadPushMedia } from './_lib/pushMediaStore.js';

// Cihaz kaydı — Guardian hydrate yok; login/ana ekranı bloklanmamalı
const registerSqlHandler = withSqlRequestNoGuardian(handlePushRegisterDevice);

// Admin push gönderimi — tam Guardian gözlemi
const sendSqlHandler = withSqlRequest(handleAdminPushSend);

// Public push görseli (FCM imageUrl) — ayrı serverless function yok (Hobby limiti)
async function handlePushMedia(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const id = String(req.query?.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'id gerekli' });
  }

  try {
    const row = await loadPushMedia(getSql(), id);
    if (!row) {
      return res.status(404).json({ error: 'Görsel bulunamadı' });
    }

    const bytes = row.bytes;
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    res.setHeader('Content-Type', row.mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Content-Length', String(buffer.length));
    return res.status(200).end(buffer);
  } catch (error) {
    console.error('[push.media]', error?.message || error);
    return res.status(500).json({ error: 'Görsel okunamadı' });
  }
}

const mediaSqlHandler = withSqlRequestNoGuardian(handlePushMedia);

export default async function pushRouter(req, res) {
  const action = String(req.query?.action || '').trim().toLowerCase();

  if (action === 'send') {
    return sendSqlHandler(req, res);
  }

  if (action === 'register-device') {
    return registerSqlHandler(req, res);
  }

  if (action === 'media') {
    return mediaSqlHandler(req, res);
  }

  return res.status(400).json({ error: 'Geçersiz push action' });
}
