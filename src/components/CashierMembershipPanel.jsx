import { Cake, Gift, Percent } from 'lucide-react';
import { getMembershipView } from '../lib/db.js';

// Kasiyer — seviye, indirim ve doğum günü kahvesi paneli
export default function CashierMembershipPanel({
  card,
  customer,
  history = [],
  onApplyDiscount,
  onApplyBirthdayCoffee,
  busy = false
}) {
  const membership = getMembershipView(card, customer, history);

  return (
    <div className="cashierMembershipPanel">
      <div className="cashierMembershipPanelHead">
        <span>Üyelik Seviyesi</span>
        <strong className={`cashierMembershipLevel cashierMembershipLevel--${membership.tierTone}`}>
          {membership.level}
        </strong>
      </div>

      <div className="cashierMembershipPanelStats">
        <div><span>Mevcut LP</span><b>{membership.lpBalance}</b></div>
        <div><span>Toplam Kazanılan LP</span><b>{membership.totalEarnedLp}</b></div>
      </div>

      {membership.discountPercent > 0 && (
        <div className="cashierMembershipAction">
          <div>
            <Percent size={16} aria-hidden="true" />
            <div>
              <strong>Seviye indirimi %{membership.discountPercent}</strong>
              <p>
                {membership.discountAvailable
                  ? 'Bu ay kullanılabilir'
                  : 'Bu ay kullanıldı'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="goldBtn"
            disabled={busy || !membership.discountAvailable}
            onClick={onApplyDiscount}
          >
            İndirim uygula
          </button>
        </div>
      )}

      <div className="cashierMembershipAction">
        <div>
          <Cake size={16} aria-hidden="true" />
          <div>
            <strong>Doğum günü kahvesi</strong>
            <p>{membership.birthdayCoffee.label}</p>
          </div>
        </div>
        <button
          type="button"
          className="ghost"
          disabled={busy || !membership.birthdayCoffee.available}
          onClick={onApplyBirthdayCoffee}
        >
          <Gift size={14} /> Uygula
        </button>
      </div>

      <p className="cashierMembershipHint">
        İndirim kampanyalarla ve LP ikramlarıyla birleştirilemez. Sadece cafe içi geçerlidir.
      </p>
    </div>
  );
}
