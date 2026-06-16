import { useEffect, useRef } from 'react';
import { ArrowRight, Gift, QrCode } from 'lucide-react';
import {
  LP_CATEGORIES,
  getLpBalance,
  getRedeemableRewards,
  lpCategoryCardView,
  canRedeemLpReward
} from '../lib/loyaltyStamps.js';
import {
  burstConfetti,
  markReadyRewardsCelebrated,
  shouldCelebrateReadyRewards,
  triggerRewardHaptic
} from '../lib/rewardCelebrate.js';
import { StampRulesBanner } from './StampRulesCopy.jsx';
import LoyaltyLevelTrack from './LoyaltyLevelTrack.jsx';

const RING = 2 * Math.PI * 46;

// Hazır ikram kartına tıklanınca QR sekmesine git
function openQrTab(setTab) {
  if (typeof setTab === 'function') setTab('qr');
}

// Hazır ikram kutlaması — konfeti + titreşim
function celebrateReadyReward(anchor, { soft = false } = {}) {
  if (anchor) {
    burstConfetti(anchor, {
      count: soft ? 14 : 24,
      duration: soft ? 1000 : 1300
    });
  }
  triggerRewardHaptic();
}

// Liberte Puan (LP) — premium kategori ödül kartları
export default function LoyaltyTripleStamps({
  card,
  level = 'Bronze',
  lpLifetime = 0,
  setTab
}) {
  const lpBalance = getLpBalance(card);
  const redeemable = getRedeemableRewards(card);
  const wrapRef = useRef(null);
  const readyRefs = useRef({});

  // Oturumda bir kez — hazır ikram varsa hafif konfeti
  useEffect(() => {
    if (redeemable.length === 0 || !shouldCelebrateReadyRewards()) return undefined;

    const firstReady = LP_CATEGORIES.find((cat) => canRedeemLpReward(card, cat.id));
    const anchor = firstReady ? readyRefs.current[firstReady.id] : wrapRef.current;
    if (!anchor) return undefined;

    const timer = window.setTimeout(() => {
      celebrateReadyReward(anchor, { soft: true });
      markReadyRewardsCelebrated();
    }, 520);

    return () => window.clearTimeout(timer);
  }, [card, redeemable.length]);

  function handleReadyClick(catId) {
    celebrateReadyReward(readyRefs.current[catId], { soft: false });
    openQrTab(setTab);
  }

  return (
    <div className="loyaltyTripleWrap" ref={wrapRef}>
      <div className="loyaltyPremiumWallet">
        <div className="loyaltyPremiumBalance">
          <span>Bakiye</span>
          <strong>
            {lpBalance}
            <small>LP</small>
          </strong>
        </div>
        <div className="loyaltyPremiumStat">
          <span>İkram</span>
          <strong>{redeemable.length}</strong>
        </div>
        <div className="loyaltyPremiumStat">
          <span>Toplam</span>
          <strong>{lpLifetime}</strong>
        </div>
        <button type="button" className="loyaltyPremiumQrBtn" onClick={() => openQrTab(setTab)}>
          <QrCode aria-hidden="true" />
          <span>Kasada göster</span>
        </button>
      </div>

      <LoyaltyLevelTrack lifetime={lpLifetime} level={level} />

      <div className="loyaltyTripleStamps" role="list" aria-label="Liberte Puan ödülleri">
        {LP_CATEGORIES.map((cat) => {
          const view = lpCategoryCardView(card, cat);
          const dashOffset = RING - (view.progress / 100) * RING;
          const cardClass = `loyaltyStampCard loyaltyStampCard--${cat.id}${view.ready ? ' isReady isClickable' : ''}${view.progress > 0 ? ' hasProgress' : ''}`;

          const cardInner = (
            <>
              {view.ready && (
                <span className="loyaltyStampSparkle loyaltyStampSparkle--a" aria-hidden="true" />
              )}
              {view.ready && (
                <span className="loyaltyStampSparkle loyaltyStampSparkle--b" aria-hidden="true" />
              )}

              <span className="loyaltyStampCost">{cat.rewardCost} LP</span>

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
                <strong>{view.shortTitle}</strong>
                <span className="loyaltyStampGain">{view.gainLabel} kazanç</span>

                <div className="loyaltyStampBar" aria-hidden="true">
                  <span style={{ width: `${view.progress}%` }} />
                </div>

                {view.ready ? (
                  <em className="loyaltyStampReady">
                    <Gift aria-hidden="true" />
                    Kasada kullan
                    <ArrowRight aria-hidden="true" />
                  </em>
                ) : (
                  <em className="loyaltyStampStatus">{view.statusLabel}</em>
                )}
              </div>
            </>
          );

          if (view.ready) {
            return (
              <button
                key={cat.id}
                type="button"
                className={cardClass}
                role="listitem"
                ref={(el) => { readyRefs.current[cat.id] = el; }}
                aria-label={`${view.shortTitle} hazır — kasada göster`}
                onClick={() => handleReadyClick(cat.id)}
              >
                {cardInner}
              </button>
            );
          }

          return (
            <article
              key={cat.id}
              className={cardClass}
              role="listitem"
              aria-label={`${view.shortTitle}, ${view.statusLabel}`}
            >
              {cardInner}
            </article>
          );
        })}
      </div>

      <StampRulesBanner />
    </div>
  );
}
