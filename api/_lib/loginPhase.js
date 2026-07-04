import { classifyLoginDbError } from './dbTransient.js';

export const LOGIN_PHASES = [
  'parse_request',
  'rate_limit',
  'credential_lookup',
  'credential_verify',
  'session_create',
  'set_cookie',
  'response_enrichment',
  'route_deadline'
];

export function createLoginPhaseTracker(trace, deadlineMs) {
  const startedAt = Date.now();
  let phase = 'parse_request';
  let sessionCreated = false;
  let sessionMeta = null;
  let customer = null;
  let existing = null;
  let rateLimitMs = null;

  return {
    getPhase: () => phase,
    setPhase: (next) => {
      phase = LOGIN_PHASES.includes(next) ? next : 'parse_request';
    },
    elapsedMs: () => Date.now() - startedAt,
    recordRateLimitMs(ms) {
      rateLimitMs = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : null;
    },
    markSessionReady(meta, cust, exist = null) {
      sessionCreated = true;
      sessionMeta = meta;
      customer = cust;
      existing = exist;
    },
    hasSessionCreated: () => sessionCreated,
    getSessionPayload: () => ({ sessionMeta, customer, existing }),
    unavailableBody(step, code = 'LOGIN_TEMPORARILY_UNAVAILABLE', diagnostics = {}) {
      const safeStep = LOGIN_PHASES.includes(step) ? step : 'route_deadline';
      const { error = null, queryTimeoutMs = null, routeDeadline = false } = diagnostics;
      const dbErrorType = error || routeDeadline
        ? classifyLoginDbError(error, { routeDeadline })
        : undefined;

      return {
        ok: false,
        code,
        step: safeStep,
        message: 'Giris su an tamamlanamiyor. Lutfen birkac saniye sonra tekrar deneyin.',
        requestId: trace.requestId,
        timings: {
          ...trace.successTimings(),
          phase: safeStep,
          elapsed_ms: Date.now() - startedAt,
          deadline_ms: deadlineMs,
          total_ms: Date.now() - startedAt,
          ...(rateLimitMs != null ? { rate_limit_ms: rateLimitMs } : {}),
          ...(queryTimeoutMs != null ? { query_timeout_ms: queryTimeoutMs } : {}),
          ...(dbErrorType ? { db_error_type: dbErrorType } : {})
        }
      };
    }
  };
}