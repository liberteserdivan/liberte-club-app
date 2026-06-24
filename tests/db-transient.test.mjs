import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTransientDbError,
  publicDbErrorCode,
  publicDbErrorMessage
} from '../api/_lib/dbTransient.js';

test('Supabase pooler kopması geçici hata sayılır', () => {
  const error = new Error('write CONNECTION_CLOSED aws-1-eu-central-1.pooler.supabase.com:6543');
  assert.equal(isTransientDbError(error), true);
  assert.equal(publicDbErrorCode(error), 'DATABASE_TRANSIENT');
  assert.match(publicDbErrorMessage(error), /geçici/);
});

test('EDBHANDLEREXITED geçici hata sayılır', () => {
  const error = new Error('(EDBHANDLEREXITED) connection to database closed');
  assert.equal(isTransientDbError(error), true);
});

test('ham DB metni istemciye sızdırılmaz', () => {
  const error = new Error('postgres connection failed on pooler.supabase.com');
  assert.doesNotMatch(publicDbErrorMessage(error), /pooler/);
});
