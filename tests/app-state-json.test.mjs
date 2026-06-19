import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppStateData } from '../api/_lib/appState.js';

test('parseAppStateData nesneyi olduğu gibi döndürür', () => {
  const state = { customers: [], menuRevision: 1 };
  assert.equal(parseAppStateData(state), state);
});

test('parseAppStateData jsonb stringini nesneye çevirir', () => {
  const parsed = parseAppStateData('{"customers":[],"menuRevision":2}');
  assert.deepEqual(parsed, { customers: [], menuRevision: 2 });
});

test('parseAppStateData bozuk stringde null döner', () => {
  assert.equal(parseAppStateData('{bad'), null);
});
