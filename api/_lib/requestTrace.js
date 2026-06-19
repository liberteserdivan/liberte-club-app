import { randomBytes } from 'node:crypto';

// Auth/kayıt istekleri için requestId, step süreleri ve toplam süre logları
export function createRequestTrace(source = 'api') {
  const requestId = randomBytes(8).toString('hex');
  const startedAt = Date.now();
  let lastMark = startedAt;
  const steps = {};

  function markStep(name) {
    const now = Date.now();
    steps[`${name}_ms`] = now - lastMark;
    lastMark = now;
    return steps[`${name}_ms`];
  }

  function log(step, extra = {}) {
    markStep(step);
    const total_ms = Date.now() - startedAt;
    console.log(`[${source}]`, JSON.stringify({ requestId, step, total_ms, ...steps, ...extra }));
    return total_ms;
  }

  function failBody(step, code, message) {
    return {
      ok: false,
      code,
      step,
      message,
      requestId,
      timings: { ...steps, total_ms: Date.now() - startedAt }
    };
  }

  function successTimings() {
    return { ...steps, total_ms: Date.now() - startedAt };
  }

  return {
    requestId,
    startedAt,
    markStep,
    log,
    failBody,
    successTimings,
    durationMs: () => Date.now() - startedAt
  };
}
