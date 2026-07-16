import { handleQrGenerate } from './_lib/handlers/qrGenerate.js';
import { withSqlRequestNoGuardian } from './_lib/sqlRequest.js';

// Guardian hydrate yok — QR üretimi müşteri kritik yolu; ekstra DB sorgusu atma
export default withSqlRequestNoGuardian(async function handler(req, res) {
  const action = String(req.query?.action || 'generate').trim().toLowerCase();

  if (action === 'generate') {
    return handleQrGenerate(req, res);
  }

  return res.status(404).json({
    ok: false,
    code: 'NOT_FOUND',
    message: 'QR servisi bulunamadı.'
  });
});
