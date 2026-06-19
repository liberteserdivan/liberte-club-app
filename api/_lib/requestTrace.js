import { randomBytes } from 'node:crypto';

// Auth/kayıt istekleri için requestId ve süre logları
export function createRequestTrace(source = 'api') {
  const requestId = randomBytes(8).toString('hex');
  const startedAt = Date.now();

  function log(step, extra = {}) {
    const ms = Date.now() - startedAt;
    console.log(`[${source}]`, JSON.stringify({ requestId, step, ms, ...extra }));
    return ms;
  }

  function failBody(step, code, message) {
    return {
      ok: false,
      code,
      step,
      message,
      requestId
    };
  }

  return {
    requestId,
    startedAt,
    log,
    failBody,
    durationMs: () => Date.now() - startedAt
  };
}
