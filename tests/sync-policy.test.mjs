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

test('QR sekmesi hızlı polling kullanır ama 5 saniyede bir poll yapmaz', () => {
  assert.equal(resolveSyncIntervalMs({ tab: 'qr' }), SYNC_INTERVAL_FAST_MS);
  // Eski 5sn aralığı egress'i şişiriyordu; realtime + since-probe ile 15sn yeterli.
  assert.ok(SYNC_INTERVAL_FAST_MS > 6000, 'QR poll aralığı 6sn üstünde olmalı');
  assert.ok(SYNC_INTERVAL_FAST_MS <= 20000);
  assert.ok(SYNC_INTERVAL_FAST_MS < SYNC_INTERVAL_NORMAL_MS);
});
