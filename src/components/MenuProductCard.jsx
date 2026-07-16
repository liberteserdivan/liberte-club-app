import { money, productImageSrc } from '../lib/db.js';
import { getMenuItemLpLabel } from '../lib/menuLp.js';

// Sade menü satırı — dikey liste, kaydırma yok
export function MenuListRow({ item, onSelect }) {
  const lpLabel = getMenuItemLpLabel(item);

  function activate() {
    onSelect?.(item);
  }

  return (
    <article
      className="menuListRow"
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      <div className="menuListThumb" style={{ '--tone': item.tone || '#b9f5d0' }}>
        {productImageSrc(item)
          ? <img src={productImageSrc(item)} alt="" />
          : <span>{item.image || '☕'}</span>}
      </div>
      <div className="menuListBody">
        <div className="menuListTop">
          <b>{item.name}</b>
          {lpLabel && <em className="menuListLpBadge">{lpLabel}</em>}
          {(item.best || item.featured) && (
            <em className="menuListBadge">{item.best ? 'Öne çıkan' : 'Favori'}</em>
          )}
        </div>
        {item.description && <p>{item.description}</p>}
      </div>
      <strong className="menuListPrice">{money(item.price)}</strong>
    </article>
  );
}

// Eski kart görünümü — başka yerlerde kullanılıyorsa kalsın
export default function MenuProductCard({ item, onSelect }) {
  return (
    <article
      className="menuProductCard"
      style={{ '--tone': item.tone || '#b9f5d0' }}
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(item);
        }
      }}
    >
      <div className="menuProductVisual">
        {productImageSrc(item)
          ? <img src={productImageSrc(item)} alt="" />
          : <span>{item.image || '☕'}</span>}
        {(item.best || item.featured) && (
          <em className="menuProductBadge">{item.best ? 'Öne çıkan' : 'Favori'}</em>
        )}
      </div>
      <div className="menuProductBody">
        <div className="menuProductTop">
          <b>{item.name}</b>
          <strong>{money(item.price)}</strong>
        </div>
        <p>{item.description}</p>
      </div>
    </article>
  );
}
