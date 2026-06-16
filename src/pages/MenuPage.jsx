import { useMemo, useState } from 'react';
import { MenuListRow } from '../components/MenuProductCard.jsx';
import MenuProductDetailModal from '../components/MenuProductDetailModal.jsx';
import PageShell from '../components/PageShell.jsx';
import PageSection from '../components/PageSection.jsx';
import { CLUB_APP_NAME } from '../lib/constants.js';
import { getMenuCategoryLpLabel } from '../lib/menuLp.js';

// Kategoriye göre ürün gruplarını döndür
function buildMenuSections(categories, items, activeCat) {
  if (activeCat !== 'all') {
    const category = categories.find((c) => String(c.id) === String(activeCat));
    const sectionItems = items.filter((i) => String(i.categoryId) === String(activeCat));
    return category && sectionItems.length ? [{ category, items: sectionItems }] : [];
  }

  return categories
    .map((category) => ({
      category,
      items: items.filter((i) => String(i.categoryId) === String(category.id))
    }))
    .filter((group) => group.items.length);
}

// Menü — sade liste, arama yok
export default function MenuPage({ db, embedded = false }) {
  const [cat, setCat] = useState('all');
  const [selected, setSelected] = useState(null);

  const cats = db.categories || [];
  const allItems = db.items || [];

  const sections = useMemo(
    () => buildMenuSections(cats, allItems, cat),
    [cats, allItems, cat]
  );

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
      className={embedded ? 'pagePro--embedded' : ''}
      eyebrow={embedded ? null : CLUB_APP_NAME}
      title={embedded ? null : 'Menü'}
      subtitle={embedded ? null : 'Kahve, tatlı, burger ve daha fazlası. Lezzetleri keşfet.'}
      stickySlot={categoryPills}
    >
      {sections.length ? sections.map(({ category, items }) => {
        const lpLabel = getMenuCategoryLpLabel(category.id);

        return (
        <PageSection
          key={category.id}
          title={<><span>{category.icon || '•'}</span> {category.name}</>}
          count={lpLabel ? `${items.length} ürün · ${lpLabel}` : `${items.length} ürün`}
        >
          {category.description && <p className="menuProSectionDesc">{category.description}</p>}
          <div className="menuList">
            {items.map((item) => (
              <MenuListRow key={item.id} item={item} onSelect={setSelected} />
            ))}
          </div>
        </PageSection>
        );
      }) : (
        <div className="empty menuProEmpty">Bu kategoride ürün bulunamadı.</div>
      )}

      {selected && (
        <MenuProductDetailModal item={selected} onClose={() => setSelected(null)} />
      )}
    </PageShell>
  );
}
