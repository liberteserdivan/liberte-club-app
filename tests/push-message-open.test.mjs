import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPushOpenData,
  handlePushOpenPayload,
  normalizePushMessage,
  subscribePushMessageOpen
} from '../src/lib/pushNavigation.js';

test('normalizePushMessage baslik ve govde dondurur', () => {
  const row = normalizePushMessage({ title: 'Kampanya', body: 'Bugun tatli' });
  assert.equal(row.title, 'Kampanya');
  assert.equal(row.body, 'Bugun tatli');
});

test('extractPushOpenData notification katmanindan title/body alir', () => {
  const data = extractPushOpenData({
    notification: {
      title: 'Sistem',
      body: 'Aciklama',
      data: { openMessage: '1', messageId: 'm1' }
    }
  });
  assert.equal(data.title, 'Sistem');
  assert.equal(data.body, 'Aciklama');
  assert.equal(data.openMessage, '1');
  assert.equal(data.messageId, 'm1');
});

test('handlePushOpenPayload mesaj dinleyicisini tetikler', () => {
  let seen = null;
  const unsub = subscribePushMessageOpen((message) => { seen = message; });
  const result = handlePushOpenPayload({ title: 'Liberte', body: 'Yeni urun', route: 'message' });
  unsub();
  assert.equal(result.route, 'campaign');
  assert.equal(seen?.body, 'Yeni urun');
});

test('dinleyici yokken gelen mesaj abone olunca flush edilir', () => {
  let seen = null;
  handlePushOpenPayload({
    notification: { title: 'Bekleyen', body: 'Soguk acilis', data: { openMessage: '1' } }
  });
  const unsub = subscribePushMessageOpen((message) => { seen = message; });
  unsub();
  assert.equal(seen?.title, 'Bekleyen');
  assert.equal(seen?.body, 'Soguk acilis');
});

test('title/body yoksa openMessage ile yedek banner acilir', () => {
  let seen = null;
  const unsub = subscribePushMessageOpen((message) => { seen = message; });
  handlePushOpenPayload({ openMessage: '1' });
  unsub();
  assert.equal(seen?.title, 'Liberte Club');
  assert.ok(seen?.body);
});

test('normalizePushMessage data.image ve data.imageUrl https gorselini korur', () => {
  const fromImage = normalizePushMessage({
    title: 'Gorsel',
    body: 'Test',
    image: 'https://cdn.example.com/a.jpg'
  });
  assert.equal(fromImage?.imageUrl, 'https://cdn.example.com/a.jpg');

  const fromImageUrl = normalizePushMessage({
    title: 'Gorsel',
    body: 'Test',
    imageUrl: 'https://cdn.example.com/b.jpg'
  });
  assert.equal(fromImageUrl?.imageUrl, 'https://cdn.example.com/b.jpg');
});

