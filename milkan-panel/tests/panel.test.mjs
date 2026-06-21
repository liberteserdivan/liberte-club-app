import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeraziCsv, filterTeraziProducts } from '../server/services/teraziExport.js';
import { applyPriceChange } from '../server/services/mockStore.js';

test('tartılı ürünleri filtreler', () => {
  const rows = filterTeraziProducts([
    { id: 1, adi: 'Peynir', fiyat: 100, tartili: true, durum: true },
    { id: 2, adi: 'Su', fiyat: 10, tartili: false, durum: true }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].adi, 'Peynir');
});

test('terazi CSV başlık ve ayırıcı içerir', () => {
  const csv = buildTeraziCsv([
    { id: 5, barkod: '2700005000001', adi: 'Zeytin', fiyat: 120, birim: 'KG' }
  ]);
  assert.match(csv, /PLU;BARKOD;URUN_ADI;BIRIM_FIYAT;BIRIM/);
  assert.match(csv, /5;2700005000001;Zeytin;120,00;KG/);
});

test('yüzde zam hesabı', () => {
  assert.equal(applyPriceChange(100, 'percent', 10), 110);
  assert.equal(applyPriceChange(200, 'fixed', 185.5), 185.5);
  assert.equal(applyPriceChange(50, 'add', 5), 55);
});
