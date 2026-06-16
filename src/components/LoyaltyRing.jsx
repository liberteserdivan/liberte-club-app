import { Crown } from 'lucide-react';

// LP dairesel ilerleme halkası
export default function LoyaltyRing({ stamps = 0, threshold = 10, rewards = 0, level = 'Bronze' }) {
  const pct = threshold ? Math.min(100, Math.round((stamps / threshold) * 100)) : 0;
  const ring = 2 * Math.PI * 46;
  const offset = ring - (pct / 100) * ring;

  return (
    <div className="loyaltyRingCard">
      <div className="loyaltyRingVisual" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" className="loyaltyRingTrack" />
          <circle
            cx="50"
            cy="50"
            r="46"
            className="loyaltyRingFill"
            strokeDasharray={ring}
            strokeDashoffset={offset}
          />
        </svg>
        <strong>{stamps}</strong>
      </div>
      <div>
        <span className="loyaltyRingLabel">LP bakiyesi</span>
        <b>{stamps} / {threshold}</b>
        <em>{rewards} kullanılabilir ödül</em>
        <div className="loyaltyRingLevel"><Crown size={14} /> {level}</div>
      </div>
    </div>
  );
}
