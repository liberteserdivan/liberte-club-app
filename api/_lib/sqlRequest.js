import { runHandlerWithSql } from './sql.js';
import { isTransientDbError } from './dbTransient.js';
import { resolveRequestId as resolveGuardianRequestId } from './guardian/requestId.js';
import { safeModeHeaderValue } from './guardian/guardianSafeMode.js';
import { recordApiSample } from './guardian/guardianMetrics.js';
import { serviceForUrl } from './guardian/guardianRouting.js';
import { hydrateGuardianState } from './guardian/guardianHydrate.js';
import { scheduleGuardianEvaluation } from './guardian/guardianAutoEvaluate.js';

// İstek için kısa, izlenebilir Guardian kimliği üret (gelen x-request-id varsa korunur)
function resolveRequestId(req) {
  return resolveGuardianRequestId(req.headers?.['x-request-id']);
}

// URL yolundan handler adı çıkar (sorgu parametreleri hariç)
function resolveHandlerName(req) {
  const url = String(req.url || '').split('?')[0];
  return url || 'api';
}

// Yanıt başlıklarına observability bilgisi ekle. x-duration-ms yanıt
// gönderilmeden hemen önce yazılır (res.end sarmalanır). DB detayı sızdırılmaz.
// Ayrıca her istek tamamlandığında Guardian metrik tamponuna ölçüm düşer.
function attachObservability(req, res) {
  const requestId = resolveRequestId(req);
  const handlerName = resolveHandlerName(req);
  const startedAt = Date.now();
  const service = serviceForUrl(req.url, req.query);

  // Handler'lar (hata gövdesi vb.) için requestId'yi req üzerinde taşı
  req.requestId = requestId;

  try {
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-handler', handlerName);
    // Guardian Safe Mode / genel durum ipucu — istemci davranışını uyarlayabilir
    res.setHeader('x-safe-mode', safeModeHeaderValue());
    res.setHeader('x-guardian-status', 'observed');
  } catch {
    // Başlık yazılamadıysa yanıtı bozma
  }

  const originalEnd = res.end;
  res.end = function patchedEnd(...args) {
    const durationMs = Date.now() - startedAt;
    try {
      if (!res.headersSent) {
        res.setHeader('x-duration-ms', String(durationMs));
      }
    } catch {
      // Süre başlığı yazılamadıysa yoksay
    }
    // Metrik kaydı best-effort — asla yanıtı bozmaz
    try {
      recordApiSample({
        service,
        endpoint: handlerName,
        method: req.method,
        durationMs,
        status: res.statusCode,
        requestId
      });
      scheduleGuardianEvaluation();
    } catch {
      // Metrik hatası yok sayılır
    }
    return originalEnd.apply(this, args);
  };

  return requestId;
}

// API girişi — paylaşılan DB istemcisini istek kapsamına bağlar ve
// yakalanmamış hatalara karşı son güvenlik ağı sağlar.
export function withSqlRequest(handler) {
  return async function sqlRequestHandler(req, res) {
    const requestId = attachObservability(req, res);
    try {
      await runHandlerWithSql(async () => {
        // Guardian: DB'den Safe Mode/incident senkronu (instance'lar arası tutarlılık)
        await hydrateGuardianState();
        return handler(req, res);
      });
    } catch (error) {
      console.error('[api.sql]', req.url || '', error?.message || error);
      if (res.headersSent) return;

      // Geçici DB hatasında 503 + tekrar denenebilir kod döndür
      const transient = isTransientDbError(error);
      res.status(transient ? 503 : 500).json({
        ok: false,
        code: transient ? 'DATABASE_TRANSIENT' : 'SERVER_ERROR',
        message: 'Sunucu geçici olarak yanıt veremedi. Lütfen tekrar deneyin.',
        requestId
      });
    }
  };
}
