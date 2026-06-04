import { Crown, Gift } from 'lucide-react';
import {
  STAMP_CATEGORIES,
  categoryProgress,
  countTotalRewards,
  countTotalStamps,
  getStampRulesText,
  normalizeCategoryRewards,
  normalizeCategoryStamps
} from '../lib/loyaltyStamps.js';

const RING = 2 * Math.PI * 46;

// Üç kategori damgası — ortada hizalı kart düzeni
export default function LoyaltyTripleStamps({ card, level = 'Bronze' }) {
  const stamps = normalizeCategoryStamps(card);
  const rewards = normalizeCategoryRewards(card);
  const totalStamps = countTotalStamps(stamps);
  const totalRewards = countTotalRewards(rewards);

  return (
    <div className="loyaltyTripleWrap">
      <div className="loyaltyTripleStats">
        <div className="loyaltyTripleStatPill">
          <span>Toplam damga</span>
          <strong>{totalStamps}</strong>
        </div>
        <div className="loyaltyTripleStatPill">
          <span>İkram hakkı</span>
          <strong>{totalRewards}</strong>
        </div>
        <div className="loyaltyTripleStatPill">
          <span>Seviye</span>
          <strong>{level}</strong>
        </div>
      </div>

      <div className="loyaltyTripleStamps" role="list" aria-label="Sadakat damgaları">
        {STAMP_CATEGORIES.map((cat, index) => {
          const count = stamps[cat.id] || 0;
          const ikram = rewards[cat.id] || 0;
          const progress = categoryProgress(stamps, cat.id);
          const dashOffset = RING - (progress / 100) * RING;
          const ready = ikram > 0;

          return (
            <article
              key={cat.id}
              className={`loyaltyStampCard${ready ? ' isReady' : ''}${count > 0 ? ' hasProgress' : ''}`}
              role="listitem"
              aria-label={`${cat.label} ${count}/${cat.threshold} damga, ${ikram} ikram hakkı`}
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
                <strong>{cat.shortLabel}</strong>
                <span>{count}/{cat.threshold} damga</span>
                {ikram > 0 && (
                  <em><Gift aria-hidden="true" /> {ikram} ikram</em>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p className="loyaltyTripleRules">
        <Crown aria-hidden="true" />
        {getStampRulesText()}
      </p>
    </div>
  );
}
