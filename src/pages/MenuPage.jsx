import { useState } from 'react';
import { Product } from '../components/Cards.jsx';

// Menü listesi ve kategori filtreleri
export default function MenuPage({ db }) {
  const [cat, setCat] = useState('all');
  const cats = db.categories || [];
  const items = cat === 'all' ? db.items : db.items.filter((i) => String(i.categoryId) === String(cat));

  return <section className="pageShell">
    <div className="menuHero">
      <h2>Menü</h2>
      <p>Favori lezzetini seç, kampanyaları takip et.</p>
    </div>
    <div className="chips">
      <button type="button" className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>Tümü</button>
      {cats.map((c) =>
        <button type="button" key={c.id} className={String(cat) === String(c.id) ? 'on' : ''} onClick={() => setCat(c.id)}>
          <span>{c.icon || '•'}</span>{c.name}
        </button>
      )}
    </div>
    <div className="productGrid">
      {items.length ? items.map((i) => <Product key={i.id} item={i} />) : <div className="empty">Bu kategoride ürün yok.</div>}
    </div>
  </section>;
}
