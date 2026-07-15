import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyCashierLpMutation,
  claimQrNonce,
  isLpMutationRejected
} from '../liberte-next/api/_lib/loyalty.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function createTxSql({
  customerExists = true,
  claimFirstUse = true,
  balance = 20,
  missingNonceTable = false
} = {}) {
  const ops = [];

  const run = async (strings) => {
    const q = String(strings?.raw?.join(' ') || strings?.join(' ') || '').toLowerCase();
    ops.push(q);
    if (q.includes('set local')) return [];
    if (q.includes('for update')) return customerExists ? [{ id: 1 }] : [];
    if (q.includes('qr_used_tokens')) {
      if (missingNonceTable) {
        const err = new Error('relation "qr_used_tokens" does not exist');
        err.code = '42P01';
        throw err;
      }
      return claimFirstUse ? [{ nonce: 'n1' }] : [];
    }
    if (q.includes('from customer_loyalty')) {
      return [{
        customer_id: 1,
        lp_balance: balance,
        lp_lifetime: balance,
        lp_schema_version: 2,
        level: 'Bronze',
        legacy_json: null
      }];
    }
    if (q.includes('insert into customer_loyalty') || q.includes('insert into loyalty_events')) {
      return [];
    }
    return [];
  };

  const sql = (...args) => run(args[0]);
  sql.begin = async (fn) => fn(sql);
  return { sql, ops };
}

test('cashier.js LP yolu applyCashierLpMutation kullanir (atomik TX)', () => {
  const source = readFileSync(join(root, 'liberte-next/api/cashier.js'), 'utf8');
  assert.match(source, /applyCashierLpMutation/);
  assert.doesNotMatch(source, /claimQrNonce\(/);
  assert.doesNotMatch(source, /writeLoyaltyCard\(/);
});

test('applyCashierLpMutation: FOR UPDATE + nonce TX icinde + earn yazar', async () => {
  const { sql, ops } = createTxSql({ balance: 5 });
  const result = await applyCashierLpMutation(sql, {
    customerId: 1,
    action: 'earn',
    category: 'coffee',
    count: 1,
    nonce: 'abc'
  });
  assert.equal(result.ok, true);
  assert.equal(result.delta, 1);
  assert.equal(result.card.lpBalance, 6);
  assert.ok(ops.some((q) => q.includes('for update')));
  assert.ok(ops.some((q) => q.includes('qr_used_tokens')));
  assert.ok(ops.some((q) => q.includes('insert into customer_loyalty')));
  assert.ok(ops.some((q) => q.includes('insert into loyalty_events')));
});

test('applyCashierLpMutation: yetersiz LP nonce rollback (throw)', async () => {
  const { sql, ops } = createTxSql({ balance: 0 });
  await assert.rejects(
    () => applyCashierLpMutation(sql, {
      customerId: 1,
      action: 'redeem',
      category: 'coffee',
      count: 1,
      nonce: 'burn-check'
    }),
    (err) => {
      assert.equal(isLpMutationRejected(err), true);
      assert.equal(err.status, 400);
      return true;
    }
  );
  assert.equal(ops.some((q) => q.includes('insert into customer_loyalty')), false);
});

test('applyCashierLpMutation: replay 409', async () => {
  const { sql } = createTxSql({ claimFirstUse: false });
  await assert.rejects(
    () => applyCashierLpMutation(sql, {
      customerId: 1,
      action: 'earn',
      category: 'coffee',
      count: 1,
      nonce: 'replay'
    }),
    (err) => err.status === 409 && isLpMutationRejected(err)
  );
});

test('claimQrNonce: tablo yoksa fail-closed', async () => {
  const { sql } = createTxSql({ missingNonceTable: true });
  await assert.rejects(
    () => claimQrNonce(sql, { nonce: 'x', action: 'earn:coffee:1', customerId: 1 }),
    (err) => err.code === 'QR_NONCE_TABLE_MISSING'
  );
});