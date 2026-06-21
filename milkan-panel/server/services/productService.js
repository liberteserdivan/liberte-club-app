import { randomUUID } from 'crypto';
import { loadConfig } from '../config.js';
import { getPool, sql } from '../db.js';
import {
  mockBulkPriceUpdate,
  mockCreateProduct,
  mockListProducts,
  mockRecordSync,
  mockSyncHistory,
  mockUpdateProduct,
  applyPriceChange,
  roundPrice
} from './mockStore.js';
import { buildTeraziCsv, filterTeraziProducts } from './teraziExport.js';

/** Ürün satırını API cevabına dönüştürür */
function mapRow(row) {
  return {
    id: row.id,
    kodu: row.kodu,
    adi: row.adi,
    barkod: row.barkod,
    fiyat: row.fiyat,
    birim: row.birim,
    tartili: row.tartili,
    kdvId: row.kdvId,
    durum: row.durum,
    sonDegisiklik: row.sonDegisiklik
  };
}

/** SQL ürün listesini çeker */
async function sqlListProducts({ q = '', tartiliOnly = false }) {
  const cfg = loadConfig();
  const pool = await getPool();
  const term = `%${String(q).trim()}%`;
  const request = pool.request();
  request.input('q', sql.NVarChar, term);
  request.input('depoId', sql.Int, cfg.depoId);

  let tartiliFilter = '';
  if (tartiliOnly) {
    tartiliFilter = "AND (b.BIRIM_ADI LIKE N'KG%' OR s.URUN_TIPI = 1 OR LEFT(b.BARKODU, 2) = '27')";
  }

  const result = await request.query(`
    SELECT TOP 500
      s.ID AS id,
      s.KODU AS kodu,
      s.ADI AS adi,
      b.BARKODU AS barkod,
      ISNULL(b.FIYAT1, 0) AS fiyat,
      ISNULL(b.BIRIM_ADI, N'ADET') AS birim,
      CASE
        WHEN b.BIRIM_ADI LIKE N'KG%' OR s.URUN_TIPI = 1 OR LEFT(b.BARKODU, 2) = '27' THEN 1
        ELSE 0
      END AS tartili,
      ISNULL(s.PERAKENDE_VERGI_ID, 2) AS kdvId,
      ISNULL(s.DURUM, 1) AS durum,
      s.SON_DEGISIKLIK_TARIHI AS sonDegisiklik
    FROM STOK s
    INNER JOIN BARKOD b ON b.STOK_ID = s.ID AND b.DEPO_ID = @depoId
    WHERE s.DURUM = 1
      AND (
        @q = N'%%' OR s.KODU LIKE @q OR s.ADI LIKE @q OR b.BARKODU LIKE @q
      )
      ${tartiliFilter}
    ORDER BY s.ADI
  `);

  return result.recordset.map((row) =>
    mapRow({
      ...row,
      tartili: Boolean(row.tartili),
      durum: Boolean(row.durum)
    })
  );
}

/** Yeni GUID üretir (SmartPOS uyumlu) */
function newGuid() {
  return randomUUID().toUpperCase();
}

/** Tartılı ürün için EAN-13 önekli barkod üretir */
function buildWeightedBarcode(plu) {
  const body = String(plu).padStart(5, '0').slice(-5);
  return `27${body}000000`.slice(0, 13);
}

/** SQL'de yeni ürün oluşturur */
async function sqlCreateProduct(payload) {
  const cfg = loadConfig();
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const idResult = await new sql.Request(tx).query('SELECT ISNULL(MAX(ID), 0) + 1 AS nextId FROM STOK');
    const stokId = idResult.recordset[0].nextId;
    const guid = newGuid();
    const now = new Date();
    const tartili = Boolean(payload.tartili);
    const birim = tartili ? 'KG' : String(payload.birim || 'ADET').toUpperCase();
    const barkod = payload.barkod?.trim() || (tartili ? buildWeightedBarcode(stokId) : String(stokId).padStart(13, '0'));

    const req = new sql.Request(tx);
    req.input('id', sql.Int, stokId);
    req.input('kodu', sql.NVarChar, payload.kodu.trim());
    req.input('adi', sql.NVarChar, payload.adi.trim());
    req.input('kdvId', sql.Int, payload.kdvId ?? 2);
    req.input('guid', sql.VarChar, guid);
    req.input('now', sql.SmallDateTime, now);
    req.input('urunTipi', sql.TinyInt, tartili ? 1 : 0);

    await req.query(`
      INSERT INTO STOK (
        ID, KODU, ADI, PERAKENDE_VERGI_ID, TOPTAN_VERGI_ID,
        SON_DEGISIKLIK_TARIHI, DURUM, URUN_TIPI, GUIDNO, INDIRIM_YAPILABILIR
      ) VALUES (
        @id, @kodu, @adi, @kdvId, @kdvId,
        @now, 1, @urunTipi, @guid, 1
      )
    `);

    const barkodReq = new sql.Request(tx);
    barkodReq.input('id', sql.Int, stokId);
    barkodReq.input('stokId', sql.Int, stokId);
    barkodReq.input('depoId', sql.Int, cfg.depoId);
    barkodReq.input('barkod', sql.NVarChar, barkod);
    barkodReq.input('guid', sql.VarChar, guid);
    barkodReq.input('birim', sql.NVarChar, birim);
    barkodReq.input('fiyat', sql.Float, Number(payload.fiyat));
    barkodReq.input('now', sql.SmallDateTime, now);

    await barkodReq.query(`
      INSERT INTO BARKOD (
        ID, STOK_ID, DEPO_ID, BARKODU, STOK_GUID_NO, GUIDNO,
        BIRIM_ADI, FIYAT1, SON_GUNCELENME_TARIHI, DURUM, ETIKET_BASILDI
      ) VALUES (
        @id, @stokId, @depoId, @barkod, @guid, @guid,
        @birim, @fiyat, @now, 1, 0
      )
    `);

    await tx.commit();
    return mapRow({
      id: stokId,
      kodu: payload.kodu,
      adi: payload.adi,
      barkod,
      fiyat: Number(payload.fiyat),
      birim,
      tartili,
      kdvId: payload.kdvId ?? 2,
      durum: true,
      sonDegisiklik: now.toISOString()
    });
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/** SQL ürün günceller */
async function sqlUpdateProduct(id, payload) {
  const cfg = loadConfig();
  const pool = await getPool();
  const now = new Date();
  const req = new sql.Request(pool);
  req.input('id', sql.Int, id);
  req.input('adi', sql.NVarChar, payload.adi?.trim());
  req.input('fiyat', sql.Float, payload.fiyat != null ? Number(payload.fiyat) : null);
  req.input('now', sql.SmallDateTime, now);
  req.input('depoId', sql.Int, cfg.depoId);

  if (payload.adi) {
    await req.query('UPDATE STOK SET ADI = @adi, SON_DEGISIKLIK_TARIHI = @now WHERE ID = @id');
  }
  if (payload.fiyat != null) {
    await req.query(`
      UPDATE BARKOD
      SET FIYAT1 = @fiyat, SON_GUNCELENME_TARIHI = @now, ETIKET_BASILDI = 0
      WHERE STOK_ID = @id AND DEPO_ID = @depoId
    `);
  }
  if (payload.fiyat != null || payload.adi) {
    await new sql.Request(pool)
      .input('id', sql.Int, id)
      .input('now', sql.SmallDateTime, now)
      .query('UPDATE STOK SET SON_DEGISIKLIK_TARIHI = @now WHERE ID = @id');
  }

  const list = await sqlListProducts({ q: '' });
  return list.find((p) => p.id === id) || null;
}

/** SQL toplu fiyat günceller */
async function sqlBulkPriceUpdate({ ids, mode, value }) {
  const cfg = loadConfig();
  const pool = await getPool();
  const now = new Date();
  let count = 0;

  for (const id of ids) {
    const currentReq = await pool
      .request()
      .input('id', sql.Int, id)
      .input('depoId', sql.Int, cfg.depoId)
      .query('SELECT TOP 1 FIYAT1 AS fiyat FROM BARKOD WHERE STOK_ID = @id AND DEPO_ID = @depoId');

    const current = currentReq.recordset[0]?.fiyat;
    if (current == null) continue;

    const next = applyPriceChange(Number(current), mode, value);
    await pool
      .request()
      .input('id', sql.Int, id)
      .input('depoId', sql.Int, cfg.depoId)
      .input('fiyat', sql.Float, next)
      .input('now', sql.SmallDateTime, now)
      .query(`
        UPDATE BARKOD SET FIYAT1 = @fiyat, SON_GUNCELENME_TARIHI = @now, ETIKET_BASILDI = 0
        WHERE STOK_ID = @id AND DEPO_ID = @depoId;
        UPDATE STOK SET SON_DEGISIKLIK_TARIHI = @now WHERE ID = @id;
      `);
    count++;
  }
  return count;
}

/** Kasaya gönderim için tüm aktif stokları işaretler */
async function sqlMarkAllForKasaSync() {
  const pool = await getPool();
  const now = new Date();
  const result = await pool
    .request()
    .input('now', sql.SmallDateTime, now)
    .query(`
      UPDATE STOK SET SON_DEGISIKLIK_TARIHI = @now WHERE DURUM = 1;
      UPDATE BARKOD SET SON_GUNCELENME_TARIHI = @now, ETIKET_BASILDI = 0 WHERE DURUM = 1;
      SELECT @@ROWCOUNT AS touched;
    `);
  return { count: result.recordset[0]?.touched ?? 0, at: now.toISOString() };
}

/** Seçili ürünleri kasa senkronu için işaretler */
async function sqlMarkIdsForKasaSync(ids) {
  const pool = await getPool();
  const now = new Date();
  let count = 0;
  for (const id of ids) {
    await pool
      .request()
      .input('id', sql.Int, id)
      .input('now', sql.SmallDateTime, now)
      .query(`
        UPDATE STOK SET SON_DEGISIKLIK_TARIHI = @now WHERE ID = @id;
        UPDATE BARKOD SET SON_GUNCELENME_TARIHI = @now, ETIKET_BASILDI = 0 WHERE STOK_ID = @id;
      `);
    count++;
  }
  return { count, at: now.toISOString() };
}

function useMock() {
  return loadConfig().mock;
}

export async function listProducts(opts) {
  return useMock() ? mockListProducts(opts) : sqlListProducts(opts);
}

export async function createProduct(payload) {
  if (useMock()) return mockCreateProduct(payload);
  return sqlCreateProduct(payload);
}

export async function updateProduct(id, payload) {
  if (useMock()) return mockUpdateProduct(id, payload);
  return sqlUpdateProduct(id, payload);
}

export async function bulkPriceUpdate(payload) {
  if (useMock()) return mockBulkPriceUpdate(payload);
  return sqlBulkPriceUpdate(payload);
}

export async function markForKasaSync(ids) {
  if (useMock()) {
    return mockRecordSync('kasa', { ids: ids?.length ? ids : 'all' });
  }
  if (!ids?.length) return sqlMarkAllForKasaSync();
  return sqlMarkIdsForKasaSync(ids);
}

export async function exportTeraziPlu() {
  const products = await listProducts({ tartiliOnly: true });
  const rows = filterTeraziProducts(products);
  const csv = buildTeraziCsv(rows);
  if (useMock()) mockRecordSync('terazi', { count: rows.length });
  return { csv, count: rows.length, rows };
}

export async function syncHistory() {
  return useMock() ? mockSyncHistory() : [];
}

export { roundPrice, applyPriceChange };
