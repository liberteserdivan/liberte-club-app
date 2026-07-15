import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  enableSafeMode,
  resetSafeMode,
  rejectIfSafeModeBlocks,
  isSafeModeFeatureBlocked
} from '../api/_lib/guardian/guardianSafeMode.js';
import { buildInitialAppState } from '../api/_lib/appStateSeed.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('BUG-022 Safe Mode dailyClaim sunucuda engeller', () => {
  resetSafeMode();
  enableSafeMode({ reason: 'test', light: false });
  assert.equal(isSafeModeFeatureBlocked('dailyClaim'), true);
  const res = mockRes();
  assert.equal(rejectIfSafeModeBlocks(res, 'dailyClaim'), true);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'SAFE_MODE_ACTIVE');
  resetSafeMode();
});

test('BUG-022 Safe Mode kapaliyken engel yok', () => {
  resetSafeMode();
  const res = mockRes();
  assert.equal(rejectIfSafeModeBlocks(res, 'dailyClaim'), false);
  assert.equal(res.statusCode, 200);
});

test('BUG-022 handlers rejectIfSafeModeBlocks cagirir', () => {
  assert.match(read('api/_lib/handlers/customerLoyaltyClaim.js'), /rejectIfSafeModeBlocks\(res, 'dailyClaim'\)/);
  assert.match(read('api/_lib/handlers/authLogin.js'), /rejectIfSafeModeBlocks\(res, 'authLogin'\)/);
});

test('BUG-026 production seed cashier_pin 5454 yazmaz', () => {
  const prevNode = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL_ENV;
  const prevPin = process.env.INITIAL_CASHIER_PIN;
  process.env.NODE_ENV = 'production';
  process.env.VERCEL_ENV = 'production';
  delete process.env.INITIAL_CASHIER_PIN;
  try {
    const state = buildInitialAppState();
    assert.equal(state.settings.cashier_pin, undefined);
  } finally {
    process.env.NODE_ENV = prevNode;
    process.env.VERCEL_ENV = prevVercel;
    if (prevPin == null) delete process.env.INITIAL_CASHIER_PIN;
    else process.env.INITIAL_CASHIER_PIN = prevPin;
  }
});

test('BUG-026 prodSeedGuard scripti var', () => {
  assert.ok(existsSync(join(root, 'scripts/_lib/prodSeedGuard.mjs')));
  assert.match(read('scripts/_lib/prodSeedGuard.mjs'), /ALLOW_PROD_DEMO_SEED/);
});

test('BUG-028 ole kod dosyalari silindi', () => {
  assert.equal(existsSync(join(root, 'src/lib/loyaltySyncBus.js')), false);
  assert.equal(existsSync(join(root, 'src/lib/authPending.js')), false);
  assert.ok(existsSync(join(root, 'app-v2/README.md')));
});

test('BUG-030 editorconfig + ci-test + import smoke', () => {
  assert.ok(existsSync(join(root, '.editorconfig')));
  assert.match(read('.editorconfig'), /charset = utf-8/);
  assert.ok(existsSync(join(root, '.github/workflows/ci-test.yml')));
  assert.match(read('.github/workflows/ci-test.yml'), /api-import-smoke/);
  assert.ok(existsSync(join(root, 'tests/api-import-smoke.test.mjs')));
});