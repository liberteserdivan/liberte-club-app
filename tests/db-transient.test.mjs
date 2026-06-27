import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTransientDbError,
  publicDbErrorCode,
  publicDbErrorMessage,
  withSqlRetry
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

test('attemptTimeoutMs: takılan sorgu sınırda vazgeçip taze bağlantıyla yeniden dener', async () => {
  let calls = 0;
  let didReset = false;
  // İlk deneme asla çözülmez (bayat bağlantı stall'ı simülasyonu);
  // ikinci deneme reset sonrası hızlı döner
  const task = () => {
    calls += 1;
    if (calls === 1) return new Promise(() => {}); // sonsuz bekleme
    return Promise.resolve('ok');
  };

  const result = await withSqlRetry(task, {
    retries: 2,
    attemptTimeoutMs: 50,
    resetClient: () => { didReset = true; }
  });

  assert.equal(result, 'ok');
  assert.equal(calls, 2, 'ilk deneme zaman aşımına uğrayıp ikinci deneme yapılmalı');
  assert.equal(didReset, true, 'zaman aşımında bağlantı sıfırlanmalı');
});

test('attemptTimeoutMs verilmezse davranış değişmez (sınır yok)', async () => {
  let calls = 0;
  const result = await withSqlRetry(() => { calls += 1; return Promise.resolve('done'); }, {
    retries: 2
  });
  assert.equal(result, 'done');
  assert.equal(calls, 1);
});

test('geçici olmayan hata zaman sınırından bağımsız hemen yükselir', async () => {
  let calls = 0;
  await assert.rejects(
    () => withSqlRetry(() => { calls += 1; throw new Error('syntax error at or near'); }, {
      retries: 3,
      attemptTimeoutMs: 1000
    }),
    /syntax error/
  );
  assert.equal(calls, 1, 'kalıcı hata yeniden denenmemeli');
});
