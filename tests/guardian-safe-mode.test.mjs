import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSafeMode, readSafeModeSync, enableSafeMode, disableSafeMode,
  safeModeHeaderValue, safeModeFeature, resetSafeMode
} from '../api/_lib/guardian/guardianSafeMode.js';
import { handleGuardian } from '../api/_lib/handlers/guardian.js';

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    end() { return this; },
    json(obj) { this.body = obj; return this; }
  };
}

test('Varsayılan Safe Mode kapalıdır', () => {
  resetSafeMode();
  const config = defaultSafeMode();
  assert.equal(config.enabled, false);
  assert.equal(safeModeHeaderValue(), 'off');
});

test('Safe Mode açılınca polling reduced + realtime degraded döner', () => {
  resetSafeMode();
  const config = enableSafeMode({ reason: 'DB latency high', level: 'incident' });
  assert.equal(config.enabled, true);
  assert.equal(config.features.polling, 'reduced');
  assert.equal(config.features.realtime, 'degraded');
  assert.equal(config.features.fullStatePull, 'disabled_for_customer');
  assert.match(safeModeHeaderValue(), /^on:/);
  assert.equal(safeModeFeature('polling'), 'reduced');
  disableSafeMode();
  assert.equal(safeModeHeaderValue(), 'off');
});

test('Safe Mode header minimal feature bayraklarını taşır (poll/fsp/rt)', () => {
  resetSafeMode();
  enableSafeMode({ reason: 'DB latency high', level: 'incident', features: { polling: 'reduced', realtime: 'degraded' } });
  const header = safeModeHeaderValue();
  // PII/secret yok; yalnızca güvenli bayraklar
  assert.match(header, /^on:incident;poll=1;fsp=1;rt=1$/);
  assert.doesNotMatch(header, /reason|@|postgres/i);
  disableSafeMode();
});

test('Safe Mode TTL dolunca otomatik kapanır (yeniden değerlendirme)', () => {
  resetSafeMode();
  enableSafeMode({ reason: 'test', ttlMinutes: 60 });
  // expiresAt'i geçmişe çek → bir sonraki okuma kapatmalı
  globalThis.__liberteGuardianSafeMode.expiresAt = new Date(Date.now() - 1000).toISOString();
  const evaluated = readSafeModeSync();
  assert.equal(evaluated.enabled, false);
});

test('Admin oturumu olmadan safe-mode değiştirilemez (401)', async () => {
  resetSafeMode();
  const req = { method: 'POST', url: '/api/guardian/safe-mode', query: { resource: 'safe-mode' }, headers: {}, body: { enabled: true } };
  const res = createMockRes();
  await handleGuardian(req, res);
  assert.equal(res.statusCode, 401);
  // Safe Mode hâlâ kapalı olmalı (yetkisiz değişiklik uygulanmadı)
  assert.equal(readSafeModeSync().enabled, false);
});
