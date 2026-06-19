import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('admin review-action endpoint kayıtlı', () => {
  const admin = readFileSync(join(root, 'api/admin.js'), 'utf8');
  assert.match(admin, /review-action/);
  assert.match(admin, /handleAdminReviewAction/);
});

test('Google yorum onayı relational store kullanır', () => {
  const review = readFileSync(join(root, 'api/_lib/reviewStore.js'), 'utf8');
  const loyalty = readFileSync(join(root, 'api/_lib/loyaltyStore.js'), 'utf8');
  assert.match(review, /google_review_bonus/);
  assert.match(loyalty, /google_review_bonus/);
});

test('ReviewApprovalAdmin tam state commit yerine API çağırır', () => {
  const cards = readFileSync(join(root, 'src/components/Cards.jsx'), 'utf8');
  assert.match(cards, /review-action/);
  assert.doesNotMatch(cards, /addStampToCustomer\(db,r\.customerId,3/);
});

test('pushDispatch admin push-send ve skipRemote kullanır', () => {
  const push = readFileSync(join(root, 'src/lib/pushDispatch.js'), 'utf8');
  assert.match(push, /resource=push-send/);
  assert.match(push, /skipRemote: true/);
  assert.match(push, /60_000/);
});

test('QR müşteri boyutu 260px ve yüksek kontrast', () => {
  const qr = readFileSync(join(root, 'src/pages/QrPage.jsx'), 'utf8');
  assert.match(qr, /QR_SIZE = 260/);
  assert.match(qr, /fgColor="#000000"/);
  assert.match(qr, /bgColor="#FFFFFF"/);
});

test('apiClient generic sunucu yanıt vermedi kullanmaz', () => {
  const api = readFileSync(join(root, 'src/lib/apiClient.js'), 'utf8');
  assert.doesNotMatch(api, /Sunucu yanıt vermedi/);
  assert.match(api, /ADMIN_REQUEST_OPTIONS/);
});

test('TestFlight native API production origin', () => {
  const api = readFileSync(join(root, 'src/lib/apiClient.js'), 'utf8');
  assert.match(api, /https:\/\/app\.liberte\.cafe/);
});
