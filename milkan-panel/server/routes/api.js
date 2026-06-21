import { Router } from 'express';
import { pingDatabase } from '../db.js';
import { loadConfig } from '../config.js';
import { createSession, verifyPin, requireAuth, revokeSession } from '../middleware/auth.js';
import {
  listProducts,
  createProduct,
  updateProduct,
  bulkPriceUpdate,
  markForKasaSync,
  exportTeraziPlu,
  syncHistory
} from '../services/productService.js';

const router = Router();

router.get('/health', async (_req, res) => {
  const db = await pingDatabase();
  const cfg = loadConfig();
  res.json({
    ok: true,
    mock: cfg.mock,
    database: db
  });
});

router.post('/login', (req, res) => {
  const pin = String(req.body?.pin || '').trim();
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Geçersiz PIN' });
  }
  const token = createSession();
  res.json({ token });
});

router.post('/logout', requireAuth, (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) revokeSession(auth.slice(7).trim());
  res.json({ ok: true });
});

router.get('/products', requireAuth, async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const tartiliOnly = req.query.tartili === '1';
    const items = await listProducts({ q, tartiliOnly });
    res.json({ items, count: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/products', requireAuth, async (req, res) => {
  try {
    const { kodu, adi, fiyat, birim, tartili, barkod, kdvId } = req.body || {};
    if (!kodu?.trim() || !adi?.trim() || fiyat == null) {
      return res.status(400).json({ error: 'Kod, ad ve fiyat zorunlu' });
    }
    const item = await createProduct({ kodu, adi, fiyat, birim, tartili, barkod, kdvId });
    res.status(201).json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/products/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const item = await updateProduct(id, req.body || {});
    if (!item) return res.status(404).json({ error: 'Ürün bulunamadı' });
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/prices/bulk', requireAuth, async (req, res) => {
  try {
    const { ids, mode, value } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'En az bir ürün seçin' });
    }
    if (!['percent', 'fixed', 'add'].includes(mode)) {
      return res.status(400).json({ error: 'Geçersiz fiyat modu' });
    }
    const count = await bulkPriceUpdate({ ids, mode, value: Number(value) });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync/kasa', requireAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null;
    const result = await markForKasaSync(ids);
    res.json({
      ok: true,
      message: 'Kasa senkronu işaretlendi. SmartPOS Yönetim otomatik gönderimi devralır.',
      result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sync/terazi/export', requireAuth, async (_req, res) => {
  try {
    const { csv, count } = await exportTeraziPlu();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="terazi-plu.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync/terazi', requireAuth, async (_req, res) => {
  try {
    const { csv, count, rows } = await exportTeraziPlu();
    res.json({
      ok: true,
      count,
      message: `${count} tartılı ürün terazi dosyası hazır.`,
      preview: rows.slice(0, 5),
      csv
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sync/history', requireAuth, async (_req, res) => {
  res.json({ items: await syncHistory() });
});

export default router;
