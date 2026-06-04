import { useEffect, useRef, useState } from 'react';
import { money, productImageSrc } from '../lib/db.js';

// Öne çıkan ürünler — yatay slider
export default function FeaturedSlider({ items, onMenuClick }) {
  const railRef = useRef(null);
  const [active, setActive] = useState(0);

  // Kaydırma konumuna göre aktif noktayı güncelle
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !items.length) return;

    function onScroll() {
      const slide = rail.querySelector('.featuredSlide');
      if (!slide) return;
      const step = slide.offsetWidth + 14;
      const idx = Math.round(rail.scrollLeft / step);
      setActive(Math.min(idx, items.length - 1));
    }

    rail.addEventListener('scroll', onScroll, { passive: true });
    return () => rail.removeEventListener('scroll', onScroll);
  }, [items.length]);

  function goTo(index) {
    const rail = railRef.current;
    const slide = rail?.querySelector('.featuredSlide');
    if (!rail || !slide) return;
    rail.scrollTo({ left: index * (slide.offsetWidth + 14), behavior: 'smooth' });
  }

  if (!items.length) return null;

  return (
    <div className="featuredSlider">
      <div className="featuredRail" ref={railRef}>
        {items.map((item) => (
          <article key={item.id} className="featuredSlide" style={{ '--tone': item.tone || '#b9f5d0' }}>
            <div className="featuredSlideVisual">
              {productImageSrc(item)
                ? <img src={productImageSrc(item)} alt="" />
                : <span>{item.image || '☕'}</span>}
            </div>
            <div className="featuredSlideBody">
              <div className="featuredSlideTop">
                <b>{item.name}</b>
                {item.best && <em>Öne çıkan</em>}
              </div>
              <p>{item.description}</p>
              <strong>{money(item.price)}</strong>
            </div>
          </article>
        ))}
      </div>

      {items.length > 1 && (
        <div className="featuredSliderFoot">
          <div className="featuredDots">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={i === active ? 'on' : ''}
                onClick={() => goTo(i)}
                aria-label={`${i + 1}. ürün`}
              />
            ))}
          </div>
          {onMenuClick && (
            <button type="button" className="homeLinkBtn featuredMenuLink" onClick={onMenuClick}>
              Tüm menü →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
