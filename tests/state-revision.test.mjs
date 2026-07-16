import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameAppStateRevision } from '../api/_lib/appState.js';

test('aynı updated_at revizyonu eşleşir', () => {
  const at = '2026-06-17T12:00:00.000Z';
  assert.equal(isSameAppStateRevision(at, at), true);
  assert.equal(isSameAppStateRevision(new Date(at), at), true);
});

test('farklı updated_at revizyonu çakışma sayılır', () => {
  assert.equal(
    isSameAppStateRevision('2026-06-17T12:00:00.000Z', '2026-06-17T12:00:01.000Z'),
    false
  );
});

test('geçersiz tarih eşleşmez', () => {
  assert.equal(isSameAppStateRevision('invalid', '2026-06-17T12:00:00.000Z'), false);
});
