import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePushSubscriptions, isDeliverablePushToken } from '../src/lib/pushSubscriptionSanitize.js';
import { collectFailedPushTokens } from '../src/lib/pushTokens.js';

const FCM_TOKEN = `${'a'.repeat(120)}`;

test('pasif kayıtlar temizlenir', () => {
  const result = sanitizePushSubscriptions([
    { id: 1, customerId: 1, token: FCM_TOKEN, active: false, platform: 'android', channel: 'native' },
    { id: 2, customerId: 2, token: `${FCM_TOKEN}b`, active: true, platform: 'android', channel: 'native' }
  ]);

  assert.equal(result.subscriptions.length, 1);
  assert.equal(result.summary.removed, 1);
});

test('native kayıt varken web kaydı düşer', () => {
  const result = sanitizePushSubscriptions([
    {
      id: 1,
      customerId: 1,
      token: FCM_TOKEN,
      active: true,
      platform: 'web',
      channel: 'web',
      updatedAt: '01.01.2026'
    },
    {
      id: 2,
      customerId: 1,
      token: `${FCM_TOKEN}c`,
      active: true,
      platform: 'android',
      channel: 'native',
      updatedAt: '02.01.2026'
    }
  ]);

  assert.equal(result.subscriptions.length, 1);
  assert.equal(result.subscriptions[0].platform, 'android');
});

test('APNs ham token elenir', () => {
  assert.equal(isDeliverablePushToken('a'.repeat(64)), false);
  assert.equal(isDeliverablePushToken(FCM_TOKEN), true);
});

test('third-party-auth hatalı token toplanır', () => {
  const tokens = [FCM_TOKEN, `${FCM_TOKEN}d`];
  const failed = collectFailedPushTokens(tokens, [
    { success: false, error: { code: 'messaging/third-party-auth-error' } },
    { success: true }
  ], { allowThirdPartyRemoval: true });

  assert.deepEqual(failed, [FCM_TOKEN]);
});
