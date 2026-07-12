import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordApiSample, summarizeService, percentile, statusFromSummary, resetMetrics
} from '../api/_lib/guardian/guardianMetrics.js';
import { SERVICE, STATUS } from '../api/_lib/guardian/guardianConstants.js';

test('percentile sıralı değerlerden p95 hesaplar', () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1);
  const p95 = percentile(values, 95);
  assert.ok(p95 >= 90 && p95 <= 100);
  assert.equal(percentile([], 95), null);
});

test('summarizeService latency ve hata oranını özetler', () => {
  resetMetrics();
  for (let i = 0; i < 10; i += 1) {
    recordApiSample({ service: SERVICE.LOYALTY, endpoint: '/api/loyalty', durationMs: 200, status: 200 });
  }
  recordApiSample({ service: SERVICE.LOYALTY, endpoint: '/api/loyalty', durationMs: 500, status: 500 });
  const summary = summarizeService(SERVICE.LOYALTY);
  assert.equal(summary.sampleCount, 11);
  assert.equal(summary.errorCount, 1);
  assert.ok(summary.errorRate > 0 && summary.errorRate < 0.2);
});

test('statusFromSummary yüksek hata oranında incident döner', () => {
  resetMetrics();
  for (let i = 0; i < 10; i += 1) {
    recordApiSample({ service: SERVICE.API, endpoint: '/api/x', durationMs: 100, status: i < 4 ? 500 : 200 });
  }
  const summary = summarizeService(SERVICE.API);
  // %40 hata → incident veya critical
  assert.notEqual(statusFromSummary(summary), STATUS.HEALTHY);
});

test('Ring buffer 500 olayda sınırlanır', () => {
  resetMetrics();
  for (let i = 0; i < 600; i += 1) {
    recordApiSample({ service: SERVICE.API, endpoint: '/api/x', durationMs: 10, status: 200 });
  }
  const summary = summarizeService(SERVICE.API);
  assert.ok(summary.sampleCount <= 500);
});

test('auth/session 401 beklenen yanıt — hata oranını şişirmez', () => {
  resetMetrics();
  for (let i = 0; i < 8; i += 1) {
    recordApiSample({
      service: SERVICE.AUTH,
      endpoint: '/api/auth/session',
      durationMs: 120,
      status: 401
    });
  }
  const summary = summarizeService(SERVICE.AUTH);
  assert.equal(summary.sampleCount, 8);
  assert.equal(summary.errorCount, 0);
  assert.equal(summary.errorRate, 0);
  assert.equal(statusFromSummary(summary), STATUS.HEALTHY);
});
