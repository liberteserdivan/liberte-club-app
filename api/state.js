import { applyCors, publicErrorMessage, readBodySafe } from './_lib/http.js';
import { loadAppState, loadAppStateRevision, loadAppStateForCustomer, saveAppState, isSameAppStateRevision } from './_lib/appState.js';
import { getSession, getSessionForBootstrap, requireAdminSession, requireSession } from './_lib/auth.js';
import { handleQrGenerate } from './_lib/handlers/qrGenerate.js';
import { logServerError } from './_lib/logServerError.js';
import { runSql, runSqlReadFast } from './_lib/runSql.js';
import { publicDbErrorCode, publicDbErrorMessage, isTransientDbError } from './_lib/dbTransient.js';
import {
  clearAllErrorLogs,
  insertErrorLog,
  listErrorLogs,
  LOG_RETENTION_DAYS
} from './_lib/errorLogs.js';
import {
  filterStateForAdmin,
  filterStateForUser,
  findCustomerWriteViolations,
  mergeAdminState,
  mergeUserState
} from './_lib/stateAccess.js';
import { applyBirthdayReward } from './_lib/loyaltyOps.js';
import { enforceAuthRateLimit } from './_lib/rateLimit.js';
import { useRelationalState } from './_lib/relationalConfig.js';
import { withSqlRequest } from './_lib/sqlRequest.js';
import { clampString, oneOfOrDefault, isBodyTooLarge } from './_lib/validateInput.js';

// Hata kaydı için izinli enum değerleri
const ERROR_LOG_LEVELS = ['error', 'warn', 'info', 'debug'];
const ERROR_LOG_PLATFORMS = ['web', 'ios', 'android', 'unknown'];

export default withSqlRequest(async function handler(req, res) {
  applyCors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'Bulut veritabanı yapılandırılmadı', mode: 'local' });
  }

  try {
    // DB havuzu ısıtma — state lambda'sının bağlantısını önceden kur. Kimlik
    // gerektirmez; login sonrası ilk state çekimi soğuk bağlantı beklemesin.
    if (req.method === 'GET' && req.query?.warm === '1') {
      const { handleWarmPing } = await import('./_lib/handlers/warmPing.js');
      return handleWarmPing(req, res);
    }

    // Hata logları — ayrı function açmamak için mevcut endpoint (Vercel Hobby limiti)
    if (req.method === 'GET' && req.query?.errorLogs === '1') {
      return await handleErrorLogList(req, res);
    }

    // Müşteri imzalı QR token — geriye uyumluluk (yeni: POST /api/qr/generate)
    if (req.method === 'GET' && req.query?.qrToken === '1') {
      return handleQrGenerate(req, res);
    }

    if (req.method === 'GET') {
      const session = await getSessionForBootstrap(req);
      if (!session?.customerId) {
        return res.status(401).json({ error: 'Oturum gerekli' });
      }

      const since = String(req.query?.since || '').trim();
      if (since) {
        const revision = await runSqlReadFast(() => loadAppStateRevision());
        if (isSameAppStateRevision(revision.updatedAt, since)) {
          return res.status(200).json({
            unchanged: true,
            updated_at: revision.updatedAt,
            mode: 'cloud',
            role: session.role,
            isAdmin: session.isAdmin,
            adminVerified: session.adminVerified
          });
        }
      }

      const isFullAdmin = session.isAdmin && session.adminVerified;
      // GET salt-okuma: yazma yan etkisi olmasın. skipPersist ile seed ve
      // menu/loyalty migration kalıcılaştırması GET içinde yapılmaz; yalnızca
      // hesaplanan state döner (fail-fast read altında saveAppState çağrılmaz).
      const remote = await runSqlReadFast(() => (
        isFullAdmin
          ? loadAppState({ skipPersist: true })
          : loadAppStateForCustomer(session.customerId, { skipPersist: true })
      ));
      if (!remote.data) {
        return res.status(200).json({ data: null, updated_at: null, mode: 'cloud' });
      }

      let stateData = remote.data;

      // Doğum günü bonusu — relational modda tam state yazımı yapma
      if (session.customerId && !session.isAdmin && !useRelationalState()) {
        const nextState = structuredClone(stateData);
        const birthday = applyBirthdayReward(nextState, session.customerId);
        if (birthday.changed) {
          await saveAppState(nextState);
          stateData = nextState;
        }
      }

      const data = isFullAdmin
        ? filterStateForAdmin(stateData)
        : filterStateForUser(stateData, session.customerId);

      return res.status(200).json({
        data,
        updated_at: remote.updatedAt,
        mode: 'cloud',
        role: session.role,
        isAdmin: session.isAdmin,
        adminVerified: session.adminVerified
      });
    }

    if (req.method === 'POST') {
      const body = readBodySafe(req);
      if (body?.errorLog) return await handleErrorLogCreate(req, res, body.errorLog);
      if (body?.action === 'clearErrorLogs') return await handleErrorLogClear(req, res);

      const data = body?.data;
      if (!data) return res.status(400).json({ error: 'data zorunlu' });

      const session = await requireSession(req, res);
      if (!session) return;

      const clientBaseAt = String(body?.updated_at || body?.baseUpdatedAt || '').trim();
      const remote = await runSqlReadFast(async () => {
        if (session.isAdmin && session.adminVerified) {
          return loadAppState();
        }
        return loadAppStateForCustomer(session.customerId);
      });

      if (clientBaseAt && remote.updatedAt && !isSameAppStateRevision(remote.updatedAt, clientBaseAt)) {
        return res.status(409).json({
          error: 'Veri başka bir oturumda güncellendi. Lütfen yenileyip tekrar dene.',
          conflict: true,
          updated_at: remote.updatedAt
        });
      }

      const canonical = remote.data || data;

      // Admin yalnızca PIN doğrulamasıyla tam state yazabilir
      if (session.isAdmin) {
        const adminSession = await requireAdminSession(req, res, { pinRequired: true });
        if (!adminSession) return;
        await runSql(() => saveAppState(mergeAdminState(canonical, data)));
        const saved = await runSqlReadFast(() => loadAppStateRevision());
        return res.status(200).json({ ok: true, mode: 'cloud', updated_at: saved.updatedAt });
      }

      // Müşteri sadakat/ödül/yetki alanlarını değiştiremez → 403 + log
      const violations = findCustomerWriteViolations(canonical, data, session.customerId);
      if (violations.length) {
        console.warn('[api/state] Yetkisiz müşteri yazma denemesi engellendi', {
          customerId: session.customerId,
          fields: violations
        });
        return res.status(403).json({
          error: 'Bu veriyi değiştirme yetkin yok.',
          fields: violations
        });
      }

      // Müşteri yalnızca güvenli profil alanlarını günceller
      const merged = mergeUserState(canonical, data, session.customerId);
      await runSql(() => saveAppState(merged));
      const saved = await runSqlReadFast(() => loadAppStateRevision());
      return res.status(200).json({ ok: true, mode: 'cloud', updated_at: saved.updatedAt });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    await logServerError({
      source: 'api.state',
      error: err,
      customerId: null
    });
    // Geçici DB sorunu (bayat bağlantı/timeout) → 20sn 500 yerine hızlı kontrollü 503.
    // İstemci bunu logout/login döngüsüne sokmaz; ham DB hatası da sızdırılmaz.
    if (isTransientDbError(err)) {
      return res.status(503).json({
        code: 'STATE_TEMPORARILY_UNAVAILABLE',
        error: 'Veriler şu an alınamıyor. Lütfen tekrar deneyin.'
      });
    }
    return res.status(500).json({
      error: publicDbErrorMessage(err, publicErrorMessage(err, 'Veritabanı hatası')),
      code: publicDbErrorCode(err, 'SERVER_ERROR')
    });
  }
});

// Yönetici — hata log listesi
async function handleErrorLogList(req, res) {
  const session = await requireAdminSession(req, res, { pinRequired: true });
  if (!session) return;

  const limit = Number(req.query?.limit || 200);
  const logs = await listErrorLogs(limit);

  return res.status(200).json({
    ok: true,
    retentionDays: LOG_RETENTION_DAYS,
    logs
  });
}

// İstemci — hata kaydı (oturum varsa customer_id eklenir)
async function handleErrorLogCreate(req, res, payload) {
  if (!payload?.message && !payload?.userMessage) {
    return res.status(400).json({ error: 'message zorunlu' });
  }

  // Gövde boyutu sınırı — şişirilmiş log payload'ı reddet
  if (isBodyTooLarge(payload)) {
    return res.status(413).json({ error: 'Hata kaydı çok büyük' });
  }

  if (await enforceAuthRateLimit(req, 'error_log', { maxHits: 30 })) {
    return res.status(429).json({ error: 'Çok fazla hata kaydı' });
  }

  // String uzunluğu ve enum doğrulaması — sınırların dışındaki veriyi kırp/normalize et
  const message = clampString(payload.userMessage || payload.message, 2000);
  if (!message.trim()) {
    return res.status(400).json({ error: 'message zorunlu' });
  }

  const detailRaw = payload.detail;
  const detail = typeof detailRaw === 'string'
    ? clampString(detailRaw, 4000)
    : detailRaw;

  const session = await getSession(req);
  const row = await insertErrorLog({
    level: oneOfOrDefault(payload.level, ERROR_LOG_LEVELS, 'error'),
    source: clampString(payload.source, 120),
    message,
    code: clampString(payload.code, 80),
    detail,
    customerId: session?.customerId || null,
    platform: oneOfOrDefault(payload.platform, ERROR_LOG_PLATFORMS, 'unknown')
  });

  return res.status(200).json({ ok: true, id: row?.id || null });
}

// Yönetici — tüm hata loglarını sil
async function handleErrorLogClear(req, res) {
  const session = await requireAdminSession(req, res, { pinRequired: true });
  if (!session) return;

  const removed = await clearAllErrorLogs();
  return res.status(200).json({ ok: true, removed });
}
