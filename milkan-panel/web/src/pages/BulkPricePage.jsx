import { useEffect, useState } from 'react';
import { api } from '../api.js';

/** Toplu fiyat değişikliği ekranı */
export default function BulkPricePage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [mode, setMode] = useState('percent');
  const [value, setValue] = useState('5');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/products')
      .then((d) => setItems(d.items || []))
      .catch((e) => setErr(e.message));
  }, []);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked) {
    if (checked) setSelected(new Set(items.map((p) => p.id)));
    else setSelected(new Set());
  }

  async function apply() {
    if (!selected.size) {
      setErr('En az bir ürün seçin');
      return;
    }
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const { count } = await api('/prices/bulk', {
        method: 'POST',
        body: JSON.stringify({
          ids: [...selected],
          mode,
          value: Number(value)
        })
      });
      setMsg(`${count} ürünün fiyatı güncellendi. Kasaya göndermeyi unutmayın.`);
      const fresh = await api('/products');
      setItems(fresh.items || []);
      setSelected(new Set());
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const modeHint =
    mode === 'percent'
      ? 'Örn: 5 → %5 zam'
      : mode === 'add'
        ? 'Örn: 10 → 10 ₺ ekle'
        : 'Seçilen ürünlerin yeni sabit fiyatı';

  return (
    <section className="card">
      <h2>Toplu fiyat değişikliği</h2>
      <div className="grid-2" style={{ maxWidth: 520 }}>
        <label>
          İşlem tipi
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="percent">Yüzde zam/indirim</option>
            <option value="add">Tutar ekle/çıkar</option>
            <option value="fixed">Sabit fiyat</option>
          </select>
        </label>
        <label>
          Değer
          <input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{modeHint}</p>

      <div className="btn-row">
        <button type="button" className="primary" disabled={busy} onClick={apply}>
          {busy ? 'Uygulanıyor...' : 'Fiyatları güncelle'}
        </button>
        <button type="button" className="ghost" onClick={() => toggleAll(true)}>Tümünü seç</button>
        <button type="button" className="ghost" onClick={() => toggleAll(false)}>Seçimi temizle</button>
      </div>

      {msg && <div className="msg ok">{msg}</div>}
      {err && <div className="msg err">{err}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={items.length > 0 && selected.size === items.length}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th>Kod</th>
              <th>Ad</th>
              <th>Mevcut fiyat</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                </td>
                <td>{p.kodu}</td>
                <td>{p.adi}</td>
                <td>{Number(p.fiyat).toFixed(2)} ₺</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
