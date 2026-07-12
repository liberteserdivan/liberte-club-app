import PageHero from '../components/PageHero.jsx';

function money(value) {
  const n = Number(value) || 0;
  return `${n.toFixed(0)} ₺`;
}

export default function MenuPage({ state }) {
  const categories = state?.categories || [];
  const products = state?.products || [];

  return (
    <div data-testid="menu-page">
      <PageHero title="Menü" subtitle="Liberte Gastro Cafe" />
      {!products.length && <div className="card"><p className="muted">Menü yükleniyor…</p></div>}
      <div className="menuList">
        {categories.map((cat) => {
          const items = products.filter((p) => Number(p.categoryId) === Number(cat.id) && p.active !== false);
          if (!items.length) return null;
          return (
            <section key={cat.id}>
              <h3 style={{ margin: '12px 0 8px', color: 'var(--forest)' }}>{cat.name}</h3>
              {items.map((item) => (
                <article className="menuItem" key={item.id}>
                  <div>
                    <b>{item.name}</b>
                    {item.description ? <p className="muted" style={{ margin: '4px 0 0' }}>{item.description}</p> : null}
                  </div>
                  <strong>{money(item.price)}</strong>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
