import { Crown, Sparkles } from 'lucide-react';
import { LP_LEVEL_TIERS, getLevelProgress } from '../lib/loyaltyStamps.js';

// Premium club seviye yolu — Bronze → Black
export default function LoyaltyLevelTrack({ lifetime = 0, level = 'Bronze' }) {
  const track = getLevelProgress(lifetime);
  const displayLevel = track.level || level;
  const isBlack = displayLevel === 'Black';

  return (
    <div className={`loyaltyLevelTrack loyaltyLevelTrack--${displayLevel.toLowerCase()}${isBlack ? ' isBlackElite' : ''}`}>
      <div className="loyaltyLevelTrackHead">
        <div className="loyaltyLevelTrackTitle">
          <Crown aria-hidden="true" />
          <span>Üyelik Seviyesi</span>
        </div>

        <div className="loyaltyLevelTrackBadgeWrap">
          {isBlack && (
            <span className="loyaltyBlackBadge">
              <Sparkles aria-hidden="true" />
              Premium Club
            </span>
          )}
          <strong>{displayLevel}</strong>
        </div>
      </div>

      <div className="loyaltyLevelRail" aria-hidden="true">
        <div className="loyaltyLevelRailFill" style={{ width: `${track.journeyPercent}%` }} />
        {LP_LEVEL_TIERS.map((tier, index) => {
          const active = index <= track.tierIndex;
          const current = index === track.tierIndex;
          const isBlackNode = tier.id === 'Black';

          return (
            <div
              key={tier.id}
              className={`loyaltyLevelNode${active ? ' isActive' : ''}${current ? ' isCurrent' : ''}${isBlackNode && current ? ' isBlackNode' : ''}`}
            >
              <span className="loyaltyLevelDot">
                {isBlackNode && current && <Crown aria-hidden="true" className="loyaltyBlackCrown" />}
              </span>
              <em>{tier.id}</em>
            </div>
          );
        })}
      </div>

      <p className="loyaltyLevelHint">
        {track.nextLevel
          ? `${track.remaining} LP ile ${track.nextLevel} seviyesine yüksel`
          : 'Premium Club — en üst seviyedesin'}
      </p>
    </div>
  );
}
