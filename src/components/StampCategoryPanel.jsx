import { Gift, Minus, Plus } from 'lucide-react';
import { LP_CATEGORIES, getLpBalance, canRedeemLpReward } from '../lib/loyaltyStamps.js';

// Kasiyer — LP ekleme ve ödül kullandırma
export default function StampCategoryPanel({
  lpBalance = 0,
  onAdd,
  onRemove,
  onRedeem,
  mode = 'cashier'
}) {
  const balance = lpBalance || 0;

  return (
    <div className="stampCategoryPanel">
      <div className="stampCategoryPanelHead">
        <h4>{mode === 'cashier' ? 'Bugün ne aldı?' : 'Liberte Puan işlemleri'}</h4>
        <p>
          {mode === 'cashier'
            ? `QR okutuldu. Toplam LP: ${balance}. Ürün kategorisine göre LP ekle veya ödül kullandır.`
            : 'Kahve +1 LP, tatlı +2 LP, burger +3 LP. Ödüller LP ile kullanılır.'}
        </p>
      </div>

      <div className={`stampCategoryGrid${mode === 'cashier' ? ' stampCategoryGrid--cashier' : ''}`}>
        {LP_CATEGORIES.map((cat) => {
          const canRedeem = canRedeemLpReward({ lpBalance: balance }, cat.id);
          const canUndo = balance >= cat.lpGain;

          return (
            <div className={`stampCategoryCard${mode === 'cashier' ? ' stampCategoryCard--cashier' : ''}`} key={cat.id}>
              <div className="stampCategoryCardTop">
                <div
                  className="stampCategoryCardPhoto"
                  style={{ backgroundImage: `url(${cat.image})` }}
                  aria-hidden="true"
                />
                <div className="stampCategoryCardBody">
                  <strong>{cat.label}</strong>
                  <span>+{cat.lpGain} LP · {cat.rewardLabel}</span>
                </div>
              </div>

              {mode === 'cashier' ? (
                <div className="stampCategoryCardActions">
                  <button type="button" className="stampCategoryMainBtn stampCategoryMainBtn--compact" onClick={() => onAdd?.(cat.id)}>
                    +{cat.lpGain} LP {cat.shortLabel}
                  </button>
                  {canRedeem && (
                    <button type="button" className="stampCategoryRedeemBtn stampCategoryRedeemBtn--compact" onClick={() => onRedeem?.(cat.id)}>
                      <Gift size={14} /> {cat.rewardLabel}
                    </button>
                  )}
                  {canUndo && (
                    <button type="button" className="stampCategoryUndoBtn stampCategoryUndoBtn--compact" onClick={() => onRemove?.(cat.id)}>
                      Geri al
                    </button>
                  )}
                </div>
              ) : (
                <div className="stampCategoryBtns">
                  <button type="button" onClick={() => onAdd?.(cat.id)} title="LP ekle"><Plus size={14} /></button>
                  <button type="button" className="ghost" onClick={() => onRemove?.(cat.id)} disabled={!canUndo} title="LP geri al"><Minus size={14} /></button>
                  <button type="button" className="goldBtn" onClick={() => onRedeem?.(cat.id)} disabled={!canRedeem} title="Ödül kullan"><Gift size={14} /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
