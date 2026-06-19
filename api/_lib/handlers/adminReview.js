import { applyCors, readBodySafe } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { createRequestTrace } from '../requestTrace.js';
import { logServerError } from '../logServerError.js';
import { approveGoogleReviewRequest, rejectGoogleReviewRequest } from '../reviewStore.js';

// Google yorum onay / red — app_state sync gerektirmez
export async function handleAdminReviewAction(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  const trace = createRequestTrace('admin.review.approve');
  const startedAt = Date.now();

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireAdminSession(req, res, { pinRequired: true });
  if (!session) return;

  try {
    const body = readBodySafe(req);
    const action = String(body.action || '').trim().toLowerCase();
    const requestId = Number(body.requestId);

    trace.log('start', {
      adminCustomerId: session.customerId,
      action,
      requestId: Number.isFinite(requestId) ? requestId : null,
      step: 'parse_body'
    });

    if (!Number.isFinite(requestId) || requestId <= 0) {
      return res.status(400).json(trace.failBody('validate', 'VALIDATION', 'Geçersiz talep kimliği'));
    }

    let result;
    if (action === 'approve') {
      result = await approveGoogleReviewRequest(requestId);
    } else if (action === 'reject') {
      result = await rejectGoogleReviewRequest(requestId);
    } else {
      return res.status(400).json(trace.failBody('validate', 'VALIDATION', 'Geçersiz işlem'));
    }

    trace.log('complete', {
      adminCustomerId: session.customerId,
      action,
      requestId,
      ok: result.ok,
      durationMs: Date.now() - startedAt,
      status: result.ok ? 'ok' : 'fail'
    });

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        code: result.code || 'REVIEW_ACTION_FAILED',
        message: result.message || 'İşlem tamamlanamadı.',
        requestId: trace.requestId,
        step: action
      });
    }

    return res.status(200).json({
      ok: true,
      requestId: trace.requestId,
      action,
      customerId: result.customerId,
      pointsAdded: result.pointsAdded || null,
      newBalance: result.newBalance ?? null,
      customer: result.customer || null,
      loyalty: result.loyalty || null
    });
  } catch (error) {
    await logServerError({
      source: 'admin.review.approve',
      error,
      customerId: session?.customerId || null,
      detail: { requestId: trace.requestId }
    });
    return res.status(500).json(trace.failBody('unexpected', 'REVIEW_ACTION_FAILED', 'İşlem tamamlanamadı.'));
  }
}
