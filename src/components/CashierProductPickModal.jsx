import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { LP_CATEGORIES } from '../lib/loyaltyStamps.js';
import {
  getMenuItemLpLabel,
  getMenuItemsForLpCategory,
  isMenuItemLpExcluded
} from '../lib/menuLp.js';

const BODY_LOCK_CLASS = 'menuDetailOpen';

// Kasiyer ürün seçimi — LP dışı ürünler devre dışı
export default function CashierProductPickModal({ lpCategory, menuItems, onSelect, onClose }) {
  const category = LP_CATEGORIES.find((row) => row.id === lpCategory);
  const items = getMenuItemsForLpCategory(lpCategory, menuItems);

  useEffect(() => {
    document.documentElement.classList.add(BODY_LOCK_CLASS);
    document.body.classList.add(BODY_LOCK_CLASS);
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.documentElement.classList.remove(BODY_LOCK_CLASS);
      document.body.classList.remove(BODY_LOCK_CLASS);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!lpCategory) return null;

  return createPortal(
    <div className="cashierPickBackdrop" onClick={onClose} role="presentation">
      <div
        className="cashierPickModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cashierPickTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cashierPickHead">
          <div>
            <span>ÜRÜN SEÇ</span>
            <h3 id="cashierPickTitle">{category?.label || lpCategory}</h3>
            <p>LP kazanmayan ürünler devre dışıdır.</p>
          </div>
          <button type="button" className="ghost cashierPickClose" onClick={onClose} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        <div className="cashierPickList">
          {items.map((item) => {
            const excluded = isMenuItemLpExcluded(item);
            const lpLabel = getMenuItemLpLabel(item);

            return (
              <button
                key={item.id}
                type="button"
                className={`cashierPickItem${excluded ? ' isExcluded' : ''}`}
                disabled={excluded}
                onClick={() => onSelect?.(item)}
              >
                <span className="cashierPickItemIcon" aria-hidden="true">{item.image || '•'}</span>
                <span className="cashierPickItemBody">
                  <strong>{item.name}</strong>
                  {excluded
                    ? <em>LP kazanmaz</em>
                    : <em>{lpLabel || `+${category?.lpGain || 0} LP`}</em>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
