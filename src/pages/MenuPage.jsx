import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import MenuProductCard from '../components/MenuProductCard.jsx';
import MenuProductDetailModal from '../components/MenuProductDetailModal.jsx';
import PageShell from '../components/PageShell.jsx';
import PageSection from '../components/PageSection.jsx';

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

  const categoryPills = (
    <div className="pageProSticky menuProCats">
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
  );

  return (
    <PageShell
      variant="menu"
      eyebrow="Liberte Gastro"
      title={settings.hero_title || 'Menü'}
      subtitle={settings.hero_subtitle || 'Favori lezzetini seç, kampanyaları takip et.'}
      stickySlot={categoryPills}
      heroSlot={(
        <label className="pageProSearch menuProSearch">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kahve, tatlı, burger ara..."
          />
        </label>
      )}
    >
      {!query && cat === 'all' && featured.length > 0 && (
        <PageSection title="Öne çıkanlar" count={`${featured.length} ürün`}>
          <div className="menuProFeaturedRail">
            {featured.map((item) => (
              <MenuProductCard key={`f-${item.id}`} item={item} onSelect={setSelected} />
            ))}
          </div>
        </PageSection>
      )}

      {grouped ? grouped.map(({ category, items }) => (
        <PageSection
          key={category.id}
          title={<><span>{category.icon || '•'}</span> {category.name}</>}
          count={`${items.length} ürün`}
        >
          {category.description && <p className="menuProSectionDesc">{category.description}</p>}
          <div className="menuProGrid">
            {items.map((item) => <MenuProductCard key={item.id} item={item} onSelect={setSelected} />)}
          </div>
        </PageSection>
      )) : (
        <PageSection
          title={cat !== 'all'
            ? <><span>{cats.find((c) => String(c.id) === String(cat))?.icon || '•'}</span> {cats.find((c) => String(c.id) === String(cat))?.name || 'Menü'}</>
            : query ? 'Arama sonucu' : null}
          count={visibleItems.length ? `${visibleItems.length} ürün` : null}
        >
          <div className="menuProGrid">
            {visibleItems.length
              ? visibleItems.map((item) => <MenuProductCard key={item.id} item={item} onSelect={setSelected} />)
              : <div className="empty menuProEmpty">Aradığın ürün bulunamadı.</div>}
          </div>
        </PageSection>
      )}

      {selected && (
        <MenuProductDetailModal item={selected} onClose={() => setSelected(null)} />
      )}
    </PageShell>
  );
}
