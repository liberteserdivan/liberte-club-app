import { withSqlRequestNoGuardian } from './_lib/sqlRequest.js';
import { getSql } from './_lib/sql.js';
import { loadPushMedia } from './_lib/pushMediaStore.js';

// Public push görseli (FCM imageUrl)
async function handleMedia(req, res) {
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
    console.error('[media]', error?.message || error);
    return res.status(500).json({ error: 'Görsel okunamadı' });
  }
}

export default withSqlRequestNoGuardian(handleMedia);
