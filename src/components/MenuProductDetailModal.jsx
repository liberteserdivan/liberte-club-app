import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, MessageCircle, ShoppingBag, X } from 'lucide-react';
import { instagramUrl, mapsUrl, yemeksepetiUrl } from '../lib/constants.js';
import { money, productImageSrc } from '../lib/db.js';

const BODY_LOCK_CLASS = 'menuDetailOpen';

// iPad Safari/WebView kaydırma kilidi — body overflow tek başına yeterli değil
function lockPageScroll() {
  const scrollY = window.scrollY;
  document.documentElement.classList.add(BODY_LOCK_CLASS);
  document.body.classList.add(BODY_LOCK_CLASS);
  document.body.style.top = `-${scrollY}px`;
  return scrollY;
}

function unlockPageScroll(scrollY) {
  document.documentElement.classList.remove(BODY_LOCK_CLASS);
  document.body.classList.remove(BODY_LOCK_CLASS);
  document.body.style.top = '';
  window.scrollTo(0, scrollY);
}

// WhatsApp sipariş mesajını oluştur
function buildOrderMessage(item) {
  return encodeURIComponent(`Merhaba Liberte, ${item.name} sipariş etmek istiyorum.`);
}

// Menü ürün detay modalı — document.body portal (iPad overflow/stacking sorunu)
export default function MenuProductDetailModal({ item, onClose }) {
  useEffect(() => {
    if (!item) return undefined;

    const scrollY = lockPageScroll();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      unlockPageScroll(scrollY);
    };
  }, [item, onClose]);

  if (!item) return null;

  const whatsappUrl = `https://wa.me/905058665406?text=${buildOrderMessage(item)}`;
  const titleId = `menu-detail-${item.id}`;

  return createPortal(
    <div className="menuDetailBackdrop" onClick={onClose} role="presentation">
      <article
        className="menuDetailModal"
        style={{ '--tone': item.tone || '#b9f5d0' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button type="button" className="menuDetailClose" onClick={onClose} aria-label="Kapat">
          <X />
        </button>

        <div className="menuDetailVisual">
          {productImageSrc(item)
            ? <img src={productImageSrc(item)} alt="" />
            : <span>{item.image || '☕'}</span>}
          {(item.best || item.featured) && (
            <em className="menuProductBadge">{item.best ? 'Öne çıkan' : 'Favori'}</em>
          )}
        </div>

        <div className="menuDetailBody">
          <div className="menuDetailTop">
            <h2 id={titleId}>{item.name}</h2>
            <strong>{money(item.price)}</strong>
          </div>
          <p>{item.description}</p>

          <div className="menuDetailActions">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="goldBtn">
              <MessageCircle aria-hidden="true" /> WhatsApp ile Sipariş
            </a>
            <a href={yemeksepetiUrl} target="_blank" rel="noopener noreferrer" className="menuDetailGhost">
              <ShoppingBag aria-hidden="true" /> Yemeksepeti
            </a>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="menuDetailGhost">
              <MapPin aria-hidden="true" /> Konum
            </a>
            <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="menuDetailGhost">
              Instagram
            </a>
          </div>
        </div>
      </article>
    </div>,
    document.body
  );
}
