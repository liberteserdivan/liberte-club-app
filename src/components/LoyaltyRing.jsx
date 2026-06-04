import { Crown } from 'lucide-react';
import LoyaltyCup3d from './LoyaltyCup3d.jsx';

// Starbucks tarzı dairesel damga halkası
export default function LoyaltyRing({ stamps = 0, threshold = 10, rewards = 0, level = 'Bronze' }) {
  const safeThreshold = Math.max(1, threshold);
  const progress = Math.min(100, (stamps / safeThreshold) * 100);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div className="loyaltyRingBoard">
      <div className="loyaltyRingSide">
        <span className="loyaltyRingLabel">Damga bakiyesi</span>
        <div className="loyaltyRingBalance">
          <span className="loyaltyRingDot" aria-hidden="true" />
          <strong>{stamps}</strong>
        </div>
        <em>{rewards} ikram içecek</em>
      </div>

      <div className="loyaltyRingCenter">
        <svg className="loyaltyRingSvg" viewBox="0 0 128 128" aria-hidden="true">
          <circle cx="64" cy="64" r={radius} className="loyaltyRingTrack" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            className="loyaltyRingFill"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>

        <LoyaltyCup3d />

        <span className="loyaltyRingCount">{stamps}/{safeThreshold}</span>
      </div>

      <div className="loyaltyRingSide loyaltyRingSideRight">
        <span className="loyaltyRingLabel">Rozetim</span>
        <div className="loyaltyRingBadge"><Crown /></div>
        <em>{level}</em>
      </div>
    </div>
  );
}
