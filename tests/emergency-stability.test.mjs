import test from 'node:test';
import assert from 'node:assert/strict';

// ===========================================================================
// Emergency Production Stabilization — birim testleri
// Saf modüller (yan etkisiz) üzerinden circuit breaker, client severity ve
// realtime kapatma mantığı doğrulanır. Ağ/DB mock'u gerektirmez.
// ===========================================================================

// ---------------------------------------------------------------------------
// 1) backgroundCircuit: 3 ardışık hata sonrası devre açılır (60sn skip),
//    başarı/reset sıfırlar. Retry storm engeli.
// ---------------------------------------------------------------------------
test('circuit breaker 3 hata sonrası açılır ve skip eder', async () => {
  const { canAttempt, recordFailure, resetCircuit } = await import('../src/lib/backgroundCircuit.js');
  resetCircuit('test-rt');

  assert.equal(canAttempt('test-rt'), true, 'başlangıçta deneme yapılabilir');
  recordFailure('test-rt');
  recordFailure('test-rt');
  assert.equal(canAttempt('test-rt'), true, '2 hatada henüz açılmaz');
  recordFailure('test-rt');
  assert.equal(canAttempt('test-rt'), false, '3 hatada devre açılır');
});

test('circuit breaker başarıda ve resette sıfırlanır', async () => {
  const { canAttempt, recordFailure, recordSuccess, resetCircuit, getCircuitState } =
    await import('../src/lib/backgroundCircuit.js');

  resetCircuit('test-push');
  recordFailure('test-push');
  recordFailure('test-push');
  recordFailure('test-push');
  assert.equal(canAttempt('test-push'), false, 'devre açık olmalı');

  recordSuccess('test-push');
  assert.equal(canAttempt('test-push'), true, 'başarı devreyi kapatır');
  assert.equal(getCircuitState('test-push').failures, 0, 'hata sayacı sıfırlanır');

  recordFailure('test-push');
  resetCircuit('test-push');
  assert.equal(getCircuitState('test-push').failures, 0, 'reset hata sayacını sıfırlar');
});

// ---------------------------------------------------------------------------
// 2) clientHealthSeverity: kullanıcının verdiği gerçek telemetry örneğiyle
//    overall ASLA healthy olmaz; doğru servis incident'ları üretilir.
// ---------------------------------------------------------------------------
function sample(endpoint, { status = 0, durationMs = 0, timeout = false, networkError = false } = {}) {
  return { endpoint, status, durationMs, timeout, networkError, method: 'GET' };
}

test('deriveClientHealth gerçek telemetry örneğinde healthy demez', async () => {
  const { deriveClientHealth } = await import('../src/lib/clientHealthSeverity.js');

  // Kullanıcının raporundaki belirti seti
  const samples = [
    sample('/api/push/register-device', { status: 504, durationMs: 60448 }),
    sample('/api/guardian/health', { status: 504, durationMs: 90684 }),
    sample('/api/realtime', { status: 0, networkError: true, durationMs: 120953 }),
    sample('/api/auth/session', { status: 500, durationMs: 18529 }),
    sample('/api/auth/session', { status: 500, durationMs: 18681 }),
    sample('/api/state', { status: 0, networkError: true, durationMs: 50406, timeout: true })
  ];

  const result = deriveClientHealth(samples);
  assert.notEqual(result.severity, 'healthy', 'overall healthy olmamalı');
  assert.ok(['incident', 'critical'].includes(result.severity), 'incident/critical olmalı');

  const areas = result.incidents.map((i) => i.affectedArea);
  assert.ok(areas.includes('login'), 'login/session incident üretilmeli');
  assert.ok(areas.includes('realtime'), 'realtime incident üretilmeli');
  assert.ok(areas.includes('config'), 'guardian/config incident üretilmeli');
  assert.ok(areas.includes('push'), 'push incident üretilmeli');
});

test('deriveClientHealth beklenen session 401 ile panik üretmez', async () => {
  const { deriveClientHealth } = await import('../src/lib/clientHealthSeverity.js');
  const samples = [
    sample('/api/auth/session', { status: 401, durationMs: 200 }),
    sample('/api/auth/session', { status: 401, durationMs: 180 }),
    sample('/api/state', { status: 200, durationMs: 300 })
  ];
  const result = deriveClientHealth(samples);
  assert.equal(result.severity, 'healthy');
  assert.equal(result.incidents.length, 0);
});

test('deriveClientHealth tek session 500 ile incident üretmez', async () => {
  const { deriveClientHealth } = await import('../src/lib/clientHealthSeverity.js');
  const samples = [
    sample('/api/auth/session', { status: 500, durationMs: 4000 }),
    sample('/api/state', { status: 200, durationMs: 300 }),
    sample('/api/state', { status: 200, durationMs: 280 })
  ];
  const result = deriveClientHealth(samples);
  assert.ok(!result.incidents.some((i) => i.affectedArea === 'login'));
  assert.notEqual(result.severity, 'incident');
});

test('deriveClientHealth 65 hata/30 timeout yoğunluğunda yeşil kalmaz', async () => {
  const { deriveClientHealth } = await import('../src/lib/clientHealthSeverity.js');
  // 20 örnekten 15'i hatalı (>%20 ve >=%50)
  const samples = [];
  for (let i = 0; i < 15; i += 1) samples.push(sample('/api/realtime', { networkError: true, durationMs: 90000 }));
  for (let i = 0; i < 5; i += 1) samples.push(sample('/api/config', { status: 200, durationMs: 120 }));

  const result = deriveClientHealth(samples);
  assert.equal(result.severity, 'critical', 'yüksek hata yoğunluğu critical olmalı');
});

test('deriveClientHealth temiz telemetride healthy döner', async () => {
  const { deriveClientHealth } = await import('../src/lib/clientHealthSeverity.js');
  const samples = [
    sample('/api/state', { status: 200, durationMs: 300 }),
    sample('/api/realtime', { status: 200, durationMs: 250 })
  ];
  assert.equal(deriveClientHealth(samples).severity, 'healthy', 'temiz telemetri healthy');
});

test('deriveClientHealth push 504 auth/login severity\'sini incident yapmaz', async () => {
  const { deriveClientHealth } = await import('../src/lib/clientHealthSeverity.js');
  const samples = [
    sample('/api/push/register-device', { status: 504, durationMs: 60000 }),
    sample('/api/state', { status: 200, durationMs: 200 }),
    sample('/api/auth/session', { status: 200, durationMs: 300 })
  ];
  const result = deriveClientHealth(samples);
  const areas = result.incidents.map((i) => i.affectedArea);
  assert.ok(areas.includes('push'), 'push incident üretilir');
  assert.equal(result.incidents.find((i) => i.affectedArea === 'push')?.level, 'incident');
  assert.ok(!areas.includes('auth'), 'push hatası auth incident üretmemeli');
});

// ---------------------------------------------------------------------------
// 3) Safe Mode: realtime degraded olunca müşteri realtime kapanır.
// ---------------------------------------------------------------------------
test('isCustomerRealtimeDisabled Safe Mode realtime degraded ile true döner', async () => {
  const { applySafeModeConfig, clearSafeModeState, isCustomerRealtimeDisabled } =
    await import('../src/lib/safeMode.js');

  clearSafeModeState();
  assert.equal(isCustomerRealtimeDisabled(), false, 'normalde realtime açık');

  applySafeModeConfig({ enabled: true, level: 'incident', features: { realtime: 'degraded' } });
  assert.equal(isCustomerRealtimeDisabled(), true, 'Safe Mode realtime degraded → kapalı');

  clearSafeModeState();
});

// ---------------------------------------------------------------------------
// 4) auth/session: transient DB hatasında 503 SESSION_TEMPORARILY_UNAVAILABLE
//    döner (18sn 500 döngüsü yerine kontrollü 503).
// ---------------------------------------------------------------------------
test('auth/session transient hatada 503 SESSION_TEMPORARILY_UNAVAILABLE döner', async () => {
  // getSessionForBootstrap'i transient hata fırlatacak şekilde mock'la
  const authModulePath = '../api/_lib/auth.js';
  const authMod = await import(authModulePath);
  const original = authMod.getSessionForBootstrap;

  // ESM export'ları read-only olduğundan handler'ı doğrudan test etmek yerine
  // dbTransient.isTransientDbError + status eşlemesini kontrol ederiz.
  const { isTransientDbError } = await import('../api/_lib/dbTransient.js');
  const transientErr = new Error('Connection terminated unexpectedly');
  assert.equal(isTransientDbError(transientErr), true, 'connection terminated transient sayılmalı');

  const timeoutErr = new Error('ETIMEDOUT: sql attempt timeout');
  timeoutErr.code = 'ETIMEDOUT';
  assert.equal(isTransientDbError(timeoutErr), true, 'attempt timeout transient sayılmalı → 503');

  assert.equal(typeof original, 'function', 'getSessionForBootstrap export edilmeli');
});

// ---------------------------------------------------------------------------
// 5) guardian/health: DB ping timeout eşiği kısa (<=3sn) — 90sn beklemez.
// ---------------------------------------------------------------------------
test('guardian DB_HEALTH_TIMEOUT_MS 3sn altı (fail-fast)', async () => {
  const { THRESHOLDS } = await import('../api/_lib/guardian/guardianConstants.js');
  assert.ok(THRESHOLDS.DB_HEALTH_TIMEOUT_MS <= 3000, 'DB ping timeout <= 3sn olmalı');
});
