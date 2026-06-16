import { Gift } from 'lucide-react';
import {
  LP_CATEGORIES,
  getLpBalance,
  getRedeemableRewards,
  lpProgressPercent,
  canRedeemLpReward
} from '../lib/loyaltyStamps.js';
import { StampRulesBanner } from './StampRulesCopy.jsx';

const RING = 2 * Math.PI * 46;

// Liberte Puan (LP) — kategori ödül ilerlemesi
export default function LoyaltyTripleStamps({ card, level = 'Bronze' }) {
  const lpBalance = getLpBalance(card);
  const redeemable = getRedeemableRewards(card);

  return (
    <div className="loyaltyTripleWrap">
      <div className="loyaltyTripleStats">
        <div className="loyaltyTripleStatPill">
          <span>Toplam LP</span>
          <strong>{lpBalance}</strong>
        </div>
        <div className="loyaltyTripleStatPill">
          <span>Kazanılabilir ikramlar</span>
          <strong>{redeemable.length}</strong>
        </div>
        <div className="loyaltyTripleStatPill">
          <span>Seviye</span>
          <strong>{level}</strong>
        </div>
      </div>

      <div className="loyaltyTripleStamps" role="list" aria-label="Liberte Puan ödülleri">
        {LP_CATEGORIES.map((cat, index) => {
          const progress = lpProgressPercent(lpBalance, cat.rewardCost);
          const dashOffset = RING - (progress / 100) * RING;
          const ready = canRedeemLpReward(card, cat.id);

          return (
            <article
              key={cat.id}
              className={`loyaltyStampCard${ready ? ' isReady' : ''}${lpBalance > 0 ? ' hasProgress' : ''}`}
              role="listitem"
              aria-label={`${cat.label} ${cat.rewardLabel}, ${lpBalance} LP`}
            >
              <span className="loyaltyStampIndex">{index + 1}</span>

              <div className="loyaltyStampVisual">
                <div className="loyaltyStampRing" aria-hidden="true">
                  <svg viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="46" className="loyaltyStampOuter" />
                    <circle cx="50" cy="50" r="46" className="loyaltyStampTrack" />
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      className="loyaltyStampFill"
                      strokeDasharray={RING}
                      strokeDashoffset={dashOffset}
                    />
                  </svg>
                </div>

                <div
                  className="loyaltyStampPhoto"
                  role="img"
                  aria-label={cat.label}
                  style={{
                    backgroundImage: `url(${cat.image})`,
                    backgroundPosition: cat.imagePosition || 'center center'
                  }}
                />
              </div>

              <div className="loyaltyStampMeta">
                <strong>{cat.rewardLabel}</strong>
                <span>+{cat.lpGain} LP · {lpBalance}/{cat.rewardCost}</span>
                {ready && (
                  <em><Gift aria-hidden="true" /> Hazır</em>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <StampRulesBanner />
    </div>
  );
}
