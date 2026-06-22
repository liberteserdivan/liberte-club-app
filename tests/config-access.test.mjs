/**
 * Config tanılama erişim kontrolü — unit test
 * Çalıştır: node tests/config-access.test.mjs
 */
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';

// configAccess iç mantığının basit doğrulaması
function matchesDiagSecret(provided, expected) {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

assert.equal(matchesDiagSecret('abc', 'abc'), true);
assert.equal(matchesDiagSecret('abc', 'abd'), false);
assert.equal(matchesDiagSecret('', 'secret'), false);

console.log('Config erişim testleri geçti.');
