import assert from 'node:assert/strict';
import {
  generateReferralCode,
  generateUniqueReferralCode,
  legacyReferralCode,
  findReferrerByInviteCode
} from '../api/lib/referralCode.js';

const code = generateReferralCode();
assert.match(code, /^LC[A-Z2-9]{6}$/);

const customers = [{ id: 1, referralCode: code }];
const unique = generateUniqueReferralCode(customers);
assert.notEqual(unique, code);

const legacy = legacyReferralCode({ id: 42 });
assert.match(legacy, /^LC[A-Z2-9]{6}$/);
assert.equal(legacy, legacyReferralCode({ id: 42 }));

const referrer = { id: 7, referralCode: 'LCABCD23' };
const found = findReferrerByInviteCode([referrer], 'lcabcd23');
assert.equal(found?.id, 7);

console.log('referral-code.test.mjs: OK');
