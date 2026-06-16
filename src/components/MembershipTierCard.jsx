import { Crown, Gift, Percent, Sparkles, TrendingUp } from 'lucide-react';
import { getMembershipView } from '../lib/db.js';

// Üyelik seviye kartı — premium koyu başlık, okunaklı açık gövde
export default function MembershipTierCard({ card, customer, history = [] }) {
  const membership = getMembershipView(card, customer, history);

  return (
    <article className={`membershipTierCard membershipTierCard--${membership.tierTone}`}>
      <div className="membershipTierCardHero">
        <div className="membershipTierCardHeroGlow" aria-hidden="true" />
        <div className="membershipTierCardHeroMain">
          <span className="membershipTierCardEyebrow">Üyelik Seviyem</span>
          <h3>{membership.level}</h3>
        </div>
        <div className="membershipTierCardBadge" aria-label={`${membership.level} seviyesi`}>
          <Crown aria-hidden="true" />
        </div>
      </div>

      <div className="membershipTierCardBody">
        <div className="membershipTierCardStats">
          <div>
            <span>Mevcut LP</span>
            <strong>{membership.lpBalance}</strong>
          </div>
          <div>
            <span>Toplam LP</span>
            <strong>{membership.totalEarnedLp}</strong>
          </div>
        </div>

        {membership.nextLevel ? (
          <div className="membershipTierCardProgress">
            <div className="membershipTierCardProgressHead">
              <TrendingUp size={14} aria-hidden="true" />
              <span>{membership.nextLevel} seviyesine {membership.remainingToNext} LP kaldı</span>
              <em>{membership.levelProgress}%</em>
            </div>
            <div className="progress membershipTierCardProgressBar">
              <span style={{ width: `${membership.levelProgress}%` }} />
            </div>
          </div>
        ) : (
          <p className="membershipTierCardMax">
            <Sparkles aria-hidden="true" /> Tüm ayrıcalıkların aktif
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
      </div>
    </article>
  );
}
