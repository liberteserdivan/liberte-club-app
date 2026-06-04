import { useEffect } from 'react';
import { MapPin, MessageCircle, ShoppingBag, X } from 'lucide-react';
import { instagramUrl, mapsUrl, yemeksepetiUrl } from '../lib/constants.js';
import { money, productImageSrc } from '../lib/db.js';

// WhatsApp sipariş mesajını oluştur
function buildOrderMessage(item) {
  return encodeURIComponent(`Merhaba Liberte, ${item.name} sipariş etmek istiyorum.`);
}

// Menü ürün detay modalı
export default function MenuProductDetailModal({ item, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!item) return null;

  const whatsappUrl = `https://wa.me/905058665406?text=${buildOrderMessage(item)}`;

  return (
    <div className="menuDetailBackdrop" onClick={onClose} role="presentation">
      <article
        className="menuDetailModal"
        style={{ '--tone': item.tone || '#b9f5d0' }}
        onClick={(e) => e.stopPropagation()}
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
            <h2>{item.name}</h2>
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
    </div>
  );
}
