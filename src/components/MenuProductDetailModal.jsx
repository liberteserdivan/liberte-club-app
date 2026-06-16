import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Instagram, MapPin, MessageCircle, ShoppingBag, X } from 'lucide-react';
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

// Sipariş ve sosyal aksiyon butonları
function MenuDetailActionButtons({ item }) {
  const whatsappUrl = `https://wa.me/905058665406?text=${buildOrderMessage(item)}`;

  const actions = [
    {
      id: 'whatsapp',
      label: 'WhatsApp ile Sipariş',
      href: whatsappUrl,
      Icon: MessageCircle,
      tone: 'whatsapp'
    },
    {
      id: 'yemeksepeti',
      label: 'Yemeksepeti',
      href: yemeksepetiUrl,
      Icon: ShoppingBag,
      tone: 'yemeksepeti'
    },
    {
      id: 'maps',
      label: 'Konum',
      href: mapsUrl,
      Icon: MapPin,
      tone: 'maps'
    },
    {
      id: 'instagram',
      label: 'Instagram',
      href: instagramUrl,
      Icon: Instagram,
      tone: 'instagram'
    }
  ];

  return (
    <div className="menuDetailActions">
      {actions.map(({ id, label, href, Icon, tone }) => (
        <a
          key={id}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`menuDetailActionBtn menuDetailActionBtn--${tone}`}
        >
          <span className="menuDetailActionIcon" aria-hidden="true">
            <Icon />
          </span>
          <span className="menuDetailActionLabel">{label}</span>
        </a>
      ))}
    </div>
  );
}

// Menü ürün detay modalı — document.body portal (iPad overflow/stacking sorunu)
export default function MenuProductDetailModal({ item, onClose }) {
  useEffect(() => {
    if (!item) return undefined;

    const scrollY = lockPageScroll();
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      unlockPageScroll(scrollY);
    };
  }, [item, onClose]);

  if (!item) return null;

  const titleId = `menu-detail-${item.id}`;
  const imageSrc = productImageSrc(item);

  return createPortal(
    <div className="menuDetailBackdrop" onClick={onClose} role="presentation">
      <article
        className="menuDetailModal"
        style={{ '--tone': item.tone || '#b9f5d0' }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button type="button" className="menuDetailClose" onClick={onClose} aria-label="Kapat">
          <X />
        </button>

        <div className={`menuDetailVisual${imageSrc ? ' menuDetailVisual--photo' : ''}`}>
          {imageSrc
            ? <img src={imageSrc} alt="" />
            : <span className="menuDetailEmoji">{item.image || '☕'}</span>}
          {(item.best || item.featured) && (
            <em className="menuProductBadge">{item.best ? 'Öne çıkan' : 'Favori'}</em>
          )}
        </div>

        <div className="menuDetailBody">
          <div className="menuDetailTop">
            <h2 id={titleId}>{item.name}</h2>
            <strong>{money(item.price)}</strong>
          </div>
          {item.description && <p>{item.description}</p>}

          <MenuDetailActionButtons item={item} />
        </div>
      </article>
    </div>,
    document.body
  );
}
