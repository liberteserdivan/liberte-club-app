import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNC_INTERVAL_FAST_MS,
  SYNC_INTERVAL_NORMAL_MS,
  resolveSyncIntervalMs
} from '../src/lib/syncPolicy.js';

test('normal sekmeler 60 saniye polling kullanır', () => {
  assert.equal(resolveSyncIntervalMs({ tab: 'home' }), SYNC_INTERVAL_NORMAL_MS);
  assert.equal(resolveSyncIntervalMs({ tab: 'profile' }), SYNC_INTERVAL_NORMAL_MS);
});

test('QR sekmesi hızlı polling kullanır', () => {
  assert.equal(resolveSyncIntervalMs({ tab: 'qr' }), SYNC_INTERVAL_FAST_MS);
  assert.ok(SYNC_INTERVAL_FAST_MS >= 8000);
  assert.ok(SYNC_INTERVAL_FAST_MS <= 10000);
});
