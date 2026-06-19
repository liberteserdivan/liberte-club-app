import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isGrantedPushSubscription,
  PUSH_AUDIENCE_OPTIONS,
  resolvePushAudience
} from '../src/lib/pushAudience.js';

const root = process.cwd();

test('isGrantedPushSubscription yalnızca granted tokenları kabul eder', () => {
  assert.equal(isGrantedPushSubscription({ token: 'abc', active: true, permissionStatus: 'granted' }), true);
  assert.equal(isGrantedPushSubscription({ token: 'abc', active: true, permissionStatus: 'denied' }), false);
  assert.equal(isGrantedPushSubscription({ token: '', active: true, permissionStatus: 'granted' }), false);
});

test('granted_devices hedefi izin vermiş cihazları seçer', () => {
  const db = {
    customers: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
    loyalty: {},
    pushSubscriptions: [
      { customerId: 1, token: 't1', active: true, permissionStatus: 'granted', platform: 'ios', channel: 'native' },
      { customerId: 2, token: 't2', active: true, permissionStatus: 'denied', platform: 'android', channel: 'native' }
    ]
  };
  const resolved = resolvePushAudience(db, 'granted_devices');
  assert.equal(resolved.deviceCount, 1);
  assert.deepEqual(resolved.tokens, ['t1']);
});

test('PUSH_AUDIENCE_OPTIONS granted_devices içerir', () => {
  assert.ok(PUSH_AUDIENCE_OPTIONS.some((row) => row.id === 'granted_devices'));
});

test('register-device endpoint tanımlı', () => {
  const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
  assert.match(vercel, /register-device/);
  const handler = readFileSync(join(root, 'api/_lib/handlers/pushRegisterDevice.js'), 'utf8');
  assert.match(handler, /requireSession/);
  assert.match(handler, /upsertPushDevice/);
});

test('firebasePush sunucu kayıt API çağırır', () => {
  const source = readFileSync(join(root, 'src/lib/firebasePush.js'), 'utf8');
  assert.match(source, /syncPushDeviceRegistration/);
  assert.match(source, /\/api\/push\/register-device/);
});
