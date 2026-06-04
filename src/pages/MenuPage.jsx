import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import MenuProductCard from '../components/MenuProductCard.jsx';
import MenuProductDetailModal from '../components/MenuProductDetailModal.jsx';

// Ürün listesini arama metnine göre filtrele
function filterByQuery(items, query) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    `${item.name} ${item.description}`.toLowerCase().includes(q)
  );
}

// Menü — premium hero, arama ve kategori bölümleri
export default function MenuPage({ db }) {
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  const cats = db.categories || [];
  const allItems = db.items || [];
  const settings = db.settings || {};

  const featured = useMemo(
    () => allItems.filter((i) => i.best || i.featured).slice(0, 6),
    [allItems]
  );

  const visibleItems = useMemo(() => {
    const base = cat === 'all'
      ? allItems
      : allItems.filter((i) => String(i.categoryId) === String(cat));
    return filterByQuery(base, query);
  }, [allItems, cat, query]);

  const grouped = useMemo(() => {
    if (cat !== 'all' || query.trim()) return null;
    const featuredIds = new Set(featured.map((i) => i.id));
    return cats
      .map((category) => ({
        category,
        items: allItems.filter(
          (i) => String(i.categoryId) === String(category.id) && !featuredIds.has(i.id)
        )
      }))
      .filter((group) => group.items.length);
  }, [allItems, cats, cat, query, featured]);

  return (
    <section className="menuPro">
      <div className="menuProHero">
        <span className="menuProEyebrow">Liberte Gastro</span>
        <h1>{settings.hero_title || 'Menü'}</h1>
        <p>{settings.hero_subtitle || 'Favori lezzetini seç, kampanyaları takip et.'}</p>

        <label className="menuProSearch">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kahve, tatlı, burger ara..."
          />
        </label>
      </div>

      <div className="menuProCats">
        <button
          type="button"
          className={cat === 'all' ? 'on' : ''}
          onClick={() => setCat('all')}
        >
          <span>✨</span> Tümü
        </button>
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            className={String(cat) === String(c.id) ? 'on' : ''}
            onClick={() => setCat(c.id)}
          >
            <span>{c.icon || '•'}</span> {c.name}
          </button>
        ))}
      </div>

      {!query && cat === 'all' && featured.length > 0 && (
        <div className="menuProSection">
          <div className="menuProSectionHead">
            <h3>Öne çıkanlar</h3>
            <em>{featured.length} ürün</em>
          </div>
          <div className="menuProFeaturedRail">
            {featured.map((item) => (
              <MenuProductCard key={`f-${item.id}`} item={item} onSelect={setSelected} />
            ))}
          </div>
        </div>
      )}

      {grouped ? grouped.map(({ category, items }) => (
        <div key={category.id} className="menuProSection">
          <div className="menuProSectionHead">
            <h3><span>{category.icon || '•'}</span> {category.name}</h3>
            <em>{items.length} ürün</em>
          </div>
          {category.description && <p className="menuProSectionDesc">{category.description}</p>}
          <div className="menuProGrid">
            {items.map((item) => <MenuProductCard key={item.id} item={item} onSelect={setSelected} />)}
          </div>
        </div>
      )) : (
        <div className="menuProSection">
          {cat !== 'all' && (
            <div className="menuProSectionHead">
              <h3>
                <span>{cats.find((c) => String(c.id) === String(cat))?.icon || '•'}</span>
                {' '}
                {cats.find((c) => String(c.id) === String(cat))?.name || 'Menü'}
              </h3>
              <em>{visibleItems.length} ürün</em>
            </div>
          )}
          {query && (
            <div className="menuProSectionHead">
              <h3>Arama sonucu</h3>
              <em>{visibleItems.length} ürün</em>
            </div>
          )}
          <div className="menuProGrid">
            {visibleItems.length
              ? visibleItems.map((item) => <MenuProductCard key={item.id} item={item} onSelect={setSelected} />)
              : <div className="empty menuProEmpty">Aradığın ürün bulunamadı.</div>}
          </div>
        </div>
      )}
      {selected && (
        <MenuProductDetailModal item={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
