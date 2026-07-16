import { Crown } from 'lucide-react';
import {
  LOYALTY_RULES_TITLE,
  LOYALTY_RULES_HIGHLIGHTS,
  LOYALTY_RULES_DETAIL_SUFFIX
} from '../lib/loyaltyStamps.js';

// Ödül vurgularını ortalanmış satırda göster
function StampRulesRewards() {
  return (
    <p className="stampRulesRewards">
      {LOYALTY_RULES_HIGHLIGHTS.map((item, index, arr) => (
        <span key={item.label}>
          <em className={`stampRulesChip stampRulesChip--${item.tone}`}>{item.label}</em>
          {index < arr.length - 2 && ', '}
          {index === arr.length - 2 && ' ve '}
        </span>
      ))}
      <span className="stampRulesSuffix">{LOYALTY_RULES_DETAIL_SUFFIX}</span>
    </p>
  );
}

// Ana sayfa banner — ortalanmış premium görünüm
export function StampRulesBanner() {
  return (
    <div className="loyaltyTripleRules">
      <div className="loyaltyTripleRulesBadge" aria-hidden="true">
        <Crown />
      </div>
      <div className="stampRulesCopy">
        <p className="stampRulesLead">{LOYALTY_RULES_TITLE}</p>
        <StampRulesRewards />
      </div>
    </div>
  );
}

// Kart ve alt bilgi alanları
export function StampRulesInline({ className = '' }) {
  return (
    <div className={`stampRulesInline${className ? ` ${className}` : ''}`}>
      <p className="stampRulesLead">{LOYALTY_RULES_TITLE}</p>
      <StampRulesRewards />
    </div>
  );
}
