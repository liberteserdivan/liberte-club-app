// app_state performans logları — yavaş adımları Vercel loglarında görünür kılar

const SLOW_MS = 400;

export function perfNow() {
  return Date.now();
}

export function logAppStatePerf(label, startedAt, extra = {}) {
  const ms = Date.now() - startedAt;
  if (ms >= SLOW_MS || process.env.APP_STATE_PERF === '1') {
    console.log('[appState.perf]', label, `${ms}ms`, extra);
  }
  return ms;
}
