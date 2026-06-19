import assert from 'node:assert/strict';
import { resolveOrigin } from '../api/_lib/http.js';

const nativeReq = (origin) => ({ headers: { origin } });

assert.equal(resolveOrigin(nativeReq('https://localhost')), 'https://localhost');
assert.equal(resolveOrigin(nativeReq('capacitor://localhost')), 'capacitor://localhost');
assert.equal(resolveOrigin(nativeReq('https://app.liberte.cafe')), 'https://app.liberte.cafe');

process.env.ALLOWED_ORIGINS = 'https://app.liberte.cafe';
// ALLOWED_ORIGINS modül yüklendikten sonra değişmez; native köken yine izinli olmalı
assert.equal(resolveOrigin(nativeReq('https://localhost')), 'https://localhost');

console.log('cors-native.test.mjs: OK');
