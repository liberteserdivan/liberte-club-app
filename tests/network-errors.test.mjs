import test from 'node:test';
import assert from 'node:assert/strict';
import {
  humanizeNetworkFailure,
  isResolvableNetworkFailure,
  isStaleNativeHostError
} from '../src/lib/networkErrors.js';

test('DNS cozulemeyen host ag hatasi sayilir', () => {
  const raw = 'Unable to resolve host "liberte-club-app.vercel.app": No address associated with hostname';
  assert.equal(isResolvableNetworkFailure(raw), true);
  assert.equal(isStaleNativeHostError(raw), true);
  assert.match(humanizeNetworkFailure(raw, { forLogin: true }), /guncel degil|güncel değil/i);
});

test('Failed to fetch ag hatasi sayilir', () => {
  assert.equal(isResolvableNetworkFailure(new Error('Failed to fetch')), true);
  assert.match(humanizeNetworkFailure('Failed to fetch'), /Internet|İnternet|baglanti|bağlantı/i);
});

test('503 transient mesaji ag hatasi degildir', () => {
  assert.equal(isResolvableNetworkFailure('Sunucu gecici olarak yanit veremedi'), false);
});
