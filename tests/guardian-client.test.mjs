import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applySafeModeHeader, applySafeModeConfig, isSafeModeEnabled,
  shouldReduceFullStatePull, shouldReducePolling, isRealtimeDegraded, resetSafeModeClient
} from '../src/lib/safeMode.js';
import {
  recordRequest, getRecentRequests, getTelemetrySummary, resetTelemetry
} from '../src/lib/guardianTelemetry.js';
import { resolveSyncIntervalMs, SYNC_INTERVAL_NORMAL_MS } from '../src/lib/syncPolicy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('x-safe-mode header istemci durumunu günceller', () => {
  resetSafeModeClient();
  applySafeModeHeader('off');
  assert.equal(isSafeModeEnabled(), false);
  applySafeModeHeader('on:incident');
  assert.equal(isSafeModeEnabled(), true);
});

test('Safe Mode açıkken customer full state pull azalır', () => {
  resetSafeModeClient();
  applySafeModeConfig({ enabled: true, level: 'incident', features: { fullStatePull: 'disabled_for_customer', polling: 'reduced' } });
  assert.equal(shouldReduceFullStatePull(), true);
  assert.equal(shouldReducePolling(), true);
});

test('Header feature bayrakları (poll/fsp/rt) customer davranışını sürer', () => {
  resetSafeModeClient();
  // Sunucu biçimi: yalnızca header ile (ek istek olmadan) feature taşınır
  applySafeModeHeader('on:incident;poll=1;fsp=1;rt=1');
  assert.equal(isSafeModeEnabled(), true);
  assert.equal(shouldReducePolling(), true);
  assert.equal(shouldReduceFullStatePull(), true);
  assert.equal(isRealtimeDegraded(), true);
});

test('Safe Mode kapalıyken normal polling davranışı korunur', () => {
  resetSafeModeClient();
  applySafeModeHeader('off');
  assert.equal(isSafeModeEnabled(), false);
  assert.equal(shouldReducePolling(), false);
  assert.equal(shouldReduceFullStatePull(), false);
  assert.equal(isRealtimeDegraded(), false);
});

test('Header poll=0 ise polling azaltma devreye girmez', () => {
  resetSafeModeClient();
  // Safe Mode açık ama polling reduced değil (yalnızca fsp)
  applySafeModeHeader('on:degraded;poll=0;fsp=1;rt=0');
  assert.equal(shouldReducePolling(), false);
  assert.equal(shouldReduceFullStatePull(), true);
});

test('Safe Mode reduced ise polling aralığı genişler', () => {
  const normal = resolveSyncIntervalMs({ tab: 'home', safeModeReduced: false });
  const reduced = resolveSyncIntervalMs({ tab: 'home', safeModeReduced: true });
  assert.equal(normal, SYNC_INTERVAL_NORMAL_MS);
  assert.ok(reduced > normal);
});

test('Telemetri istekleri kaydeder ve network error sayar', () => {
  resetTelemetry();
  recordRequest({ endpoint: '/api/state', method: 'GET', durationMs: 120, status: 200 });
  recordRequest({ endpoint: '/api/loyalty', method: 'POST', status: 0, networkError: true });
  const summary = getTelemetrySummary();
  assert.equal(summary.total, 2);
  assert.equal(summary.networkError, 1);
  assert.equal(getRecentRequests(10).length, 2);
});

test('apiClient guardian telemetri + safe mode header entegrasyonu kaynakta var', () => {
  const source = readFileSync(join(root, 'src/lib/apiClient.js'), 'utf8');
  assert.match(source, /recordRequest/);
  assert.match(source, /applySafeModeHeader/);
});

test('AdminPage Sistem Sağlığı sekmesini içerir', () => {
  const source = readFileSync(join(root, 'src/pages/AdminPage.jsx'), 'utf8');
  assert.match(source, /Sistem Sağlığı/);
  assert.match(source, /SystemHealthPanel/);
});
