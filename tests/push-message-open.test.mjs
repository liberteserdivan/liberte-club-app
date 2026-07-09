import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePushOpenPayload, normalizePushMessage, subscribePushMessageOpen } from '../src/lib/pushNavigation.js';

test('normalizePushMessage baslik ve govde dondurur', () => {
  const row = normalizePushMessage({ title: 'Kampanya', body: 'Bugun tatli' });
  assert.equal(row.title, 'Kampanya');
  assert.equal(row.body, 'Bugun tatli');
});

test('handlePushOpenPayload mesaj dinleyicisini tetikler', () => {
  let seen = null;
  const unsub = subscribePushMessageOpen((message) => { seen = message; });
  const result = handlePushOpenPayload({ title: 'Liberte', body: 'Yeni urun', route: 'message' });
  unsub();
  assert.equal(result.route, 'campaign');
  assert.equal(seen?.body, 'Yeni urun');
});