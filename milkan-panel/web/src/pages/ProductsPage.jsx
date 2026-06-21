import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const emptyForm = {
  kodu: '',
  adi: '',
  fiyat: '',
  birim: 'ADET',
  tartili: false,
  barkod: ''
};

/** Ürün listesi ve yeni ürün ekleme */
export default function ProductsPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async (search = q) => {
    const data = await api(`/products?q=${encodeURIComponent(search)}`);
    setItems(data.items || []);
  }, [q]);

  useEffect(() => {
    load('').catch((e) => setErr(e.message));
  }, [load]);

  async function handleSearch(e) {
    e.preventDefault();
    setErr('');
    try {
      await load(q);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await api('/products', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          fiyat: Number(form.fiyat),
          birim: form.tartili ? 'KG' : form.birim
        })
      });
      setForm(emptyForm);
      setMsg('Ürün eklendi.');
      await load(q);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function quickPrice(id, fiyat) {
    const next = prompt('Yeni fiyat (₺):', String(fiyat));
    if (next == null) return;
    setErr('');
    try {
      await api(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fiyat: Number(next) })
      });
      setMsg('Fiyat güncellendi.');
      await load(q);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <>
      <section className="card">
        <h2>Yeni ürün</h2>
        <form onSubmit={handleCreate}>
          <div className="grid-2">
            <label>
              Stok kodu
              <input
                required
                value={form.kodu}
                onChange={(e) => setForm({ ...form, kodu: e.target.value.toUpperCase() })}
                placeholder="PEYNIR001"
              />
            </label>
            <label>
              Ürün adı
              <input
                required
                value={form.adi}
                onChange={(e) => setForm({ ...form, adi: e.target.value })}
                placeholder="Tam Yağlı Beyaz Peynir"
              />
            </label>
            <label>
              Satış fiyatı (₺)
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.fiyat}
                onChange={(e) => setForm({ ...form, fiyat: e.target.value })}
              />
            </label>
            <label>
              Barkod (opsiyonel)
              <input
                value={form.barkod}
                onChange={(e) => setForm({ ...form, barkod: e.target.value })}
                placeholder="Otomatik üretilir"
              />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={form.tartili}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tartili: e.target.checked,
                    birim: e.target.checked ? 'KG' : 'ADET'
                  })
                }
              />
              Tartılı ürün (KG / terazi)
            </label>
            {!form.tartili && (
              <label>
                Birim
                <select
                  value={form.birim}
                  onChange={(e) => setForm({ ...form, birim: e.target.value })}
                >
                  <option value="ADET">Adet</option>
                  <option value="PAKET">Paket</option>
                  <option value="LT">Litre</option>
                </select>
              </label>
            )}
          </div>
          <div className="btn-row">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Kaydediliyor...' : 'Ürün ekle'}
            </button>
          </div>
        </form>
        {msg && <div className="msg ok">{msg}</div>}
        {err && <div className="msg err">{err}</div>}
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Ürün listesi</h2>
        <form className="search-row" onSubmit={handleSearch}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Kod, ad veya barkod ara..."
          />
          <button type="submit" className="ghost">Ara</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kod</th>
                <th>Ad</th>
                <th>Fiyat</th>
                <th>Birim</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>{p.kodu}</td>
                  <td>{p.adi}</td>
                  <td>{Number(p.fiyat).toFixed(2)} ₺</td>
                  <td>
                    <span className={`badge ${p.tartili ? 'kg' : ''}`}>
                      {p.birim || (p.tartili ? 'KG' : 'ADET')}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="ghost" onClick={() => quickPrice(p.id, p.fiyat)}>
                      Fiyat
                    </button>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--muted)' }}>Ürün bulunamadı</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
