import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppStateData, serializeAppStateJson } from '../api/_lib/appState.js';

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

test('serializeAppStateJson geçerli JSON string üretir', () => {
  const text = serializeAppStateJson({ customers: [{ id: 1, name: 'A' }] });
  assert.equal(typeof text, 'string');
  assert.deepEqual(JSON.parse(text).customers[0].name, 'A');
});
