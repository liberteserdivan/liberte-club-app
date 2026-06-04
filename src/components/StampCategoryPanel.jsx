import { Gift, Minus, Plus } from 'lucide-react';
import { STAMP_CATEGORIES } from '../lib/loyaltyStamps.js';

// Kasiyer — kategori damga ve ikram işlemleri
export default function StampCategoryPanel({
  categoryStamps,
  categoryRewards,
  onAdd,
  onRemove,
  onRedeem,
  mode = 'cashier'
}) {
  return (
    <div className="stampCategoryPanel">
      <div className="stampCategoryPanelHead">
        <h4>{mode === 'cashier' ? 'Bugün ne aldı?' : 'Kategori damgaları'}</h4>
        <p>
          {mode === 'cashier'
            ? 'QR okutuldu. Aldığı ürünün kategorisine damga bas.'
            : 'Her kategori ayrı sayılır; eşik dolunca o kategoriden ikram hakkı oluşur.'}
        </p>
      </div>

      <div className="stampCategoryGrid">
        {STAMP_CATEGORIES.map((cat) => {
          const count = categoryStamps?.[cat.id] || 0;
          const ikram = categoryRewards?.[cat.id] || 0;

          return (
            <div className="stampCategoryCard" key={cat.id}>
              <div
                className="stampCategoryCardPhoto"
                style={{ backgroundImage: `url(${cat.image})` }}
                aria-hidden="true"
              />
              <div className="stampCategoryCardBody">
                <strong>{cat.label}</strong>
                <span>{count}/{cat.threshold} damga</span>
                <em>{ikram} ikram hakkı</em>
              </div>

              {mode === 'cashier' ? (
                <button type="button" className="stampCategoryMainBtn" onClick={() => onAdd?.(cat.id)}>
                  +1 {cat.shortLabel} Damgası
                </button>
              ) : (
                <div className="stampCategoryBtns">
                  <button type="button" onClick={() => onAdd?.(cat.id)} title="Damga ekle"><Plus size={14} /></button>
                  <button type="button" className="ghost" onClick={() => onRemove?.(cat.id)} disabled={!count} title="Damga sil"><Minus size={14} /></button>
                  <button type="button" className="goldBtn" onClick={() => onRedeem?.(cat.id)} disabled={!ikram} title="İkram kullan"><Gift size={14} /></button>
                </div>
              )}

              {mode === 'cashier' && ikram > 0 && (
                <button type="button" className="stampCategoryRedeemBtn" onClick={() => onRedeem?.(cat.id)}>
                  <Gift size={14} /> {cat.shortLabel} ikramını kullandır
                </button>
              )}

              {mode === 'cashier' && count > 0 && (
                <button type="button" className="stampCategoryUndoBtn" onClick={() => onRemove?.(cat.id)}>
                  Damgayı geri al
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
