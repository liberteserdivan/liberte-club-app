import { money, productImageSrc } from '../lib/db.js';

// Menü sayfası premium ürün kartı
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
