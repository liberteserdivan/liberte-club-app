import { handleQrGenerate } from './_lib/handlers/qrGenerate.js';
import { withSqlRequest } from './_lib/sqlRequest.js';

export default withSqlRequest(async function handler(req, res) {
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
