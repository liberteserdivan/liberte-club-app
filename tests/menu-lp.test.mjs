import assert from 'node:assert/strict';
import test from 'node:test';
import { getMenuItemLpLabel, getMenuCategoryLpLabel, assertMenuItemCanEarnLp, requiresProductPickForLpCategory } from '../src/lib/menuLp.js';
import { parsePhoneList } from '../src/lib/phoneMask.js';

test('burger kategorisi menüde +3 LP gösterir', () => {
  assert.equal(getMenuCategoryLpLabel(6), '+3 LP');
});

test('Patates Tabağı ürününde LP rozeti yok', () => {
  assert.equal(getMenuItemLpLabel({ id: 68, categoryId: 6, name: 'Patates Tabağı' }), '');
});

test('diğer burger ürünlerinde LP rozeti var', () => {
  assert.equal(getMenuItemLpLabel({ id: 69, categoryId: 6, name: 'Smash Burger' }), '+3 LP');
});

test('burger kategorisi kasiyerde ürün seçimi istemez — doğrudan +3 LP', () => {
  const patates = { id: 68, categoryId: 6, name: 'Patates Tabağı' };
  const smash = { id: 69, categoryId: 6, name: 'Smash Burger' };
  assert.equal(assertMenuItemCanEarnLp(patates).ok, false);
  assert.equal(assertMenuItemCanEarnLp(smash).ok, true);
  assert.equal(requiresProductPickForLpCategory('burger', [patates, smash]), false);
});

test('parsePhoneList satır ve virgülle telefon ayırır', () => {
  const phones = parsePhoneList('5051234567\n0532 987 65 43, 905059998877');
  assert.deepEqual(phones, ['5051234567', '5329876543', '5059998877']);
});
