import { Crown, Gift, Percent, Sparkles } from 'lucide-react';
import { getMembershipView } from '../lib/db.js';

// Üyelik seviye kartı — profil ve QR ekranı
export default function MembershipTierCard({ card, customer, history = [] }) {
  const membership = getMembershipView(card, customer, history);

  return (
    <article className={`membershipTierCard membershipTierCard--${membership.tierTone}`}>
      <header className="membershipTierCardHead">
        <div>
          <span className="membershipTierCardEyebrow">Üyelik Seviyem</span>
          <h3>{membership.levelLabel}</h3>
        </div>
        <div className="membershipTierCardBadge">
          <Crown aria-hidden="true" />
          <strong>{membership.level}</strong>
        </div>
      </header>

      <div className="membershipTierCardStats">
        <div>
          <span>Mevcut LP</span>
          <strong>{membership.lpBalance}</strong>
        </div>
        <div>
          <span>Toplam Kazanılan LP</span>
          <strong>{membership.totalEarnedLp}</strong>
        </div>
      </div>

      {membership.nextLevel ? (
        <div className="membershipTierCardProgress">
          <div className="progress">
            <span style={{ width: `${membership.levelProgress}%` }} />
          </div>
          <p>
            {membership.nextLevel} seviyesine <b>{membership.remainingToNext} LP</b> kaldı
          </p>
        </div>
      ) : (
        <p className="membershipTierCardMax">
          <Sparkles aria-hidden="true" /> Premium Club — en üst seviyedesin
        </p>
      )}

      <div className="membershipTierCardBenefits">
        <h4>Avantajların</h4>
        <ul>
          {membership.benefits.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      {membership.discountPercent > 0 && (
        <div className="membershipTierCardDiscount">
          <Percent aria-hidden="true" />
          <div>
            <strong>
              {membership.discountAvailable
                ? `Bu ay %${membership.discountPercent} indirim hakkın hazır`
                : `Bu ay %${membership.discountPercent} indirim kullanıldı`}
            </strong>
            {membership.discountRules.map((rule) => (
              <p key={rule}>{rule}</p>
            ))}
          </div>
        </div>
      )}

      <div className="membershipTierCardUniversal">
        <Gift aria-hidden="true" />
        <div>
          {membership.universalBenefits.map((item) => (
            <p key={item}>{item}</p>
          ))}
          <p className="membershipTierCardBirthdayStatus">{membership.birthdayCoffee.label}</p>
        </div>
      </div>
    </article>
  );
}
