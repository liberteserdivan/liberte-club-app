// Liberte Puan (LP) — müşteri arayüzü sabitleri ve geri uyumluluk
import { BRAND_SLOGAN, LOYALTY_PROMO } from './constants.js';
import {
  LP_CATEGORIES,
  LP_SLOT_COUNT,
  emptyCategoryStamps,
  emptyCategoryRewards,
  migrateLoyaltyCard,
  getLpBalance,
  getLpLifetime,
  getRedeemableRewards,
  lpProgressPercent,
  lpToNextReward,
  levelByLp,
  canRedeemLpReward,
  getCategoryLpGain,
  getCategoryRewardCost,
  lpRewardStatusText,
  lpRemainingForReward
} from './loyaltyPoints.js';

export {
  LP_CATEGORIES,
  LP_SLOT_COUNT,
  emptyCategoryStamps,
  emptyCategoryRewards,
  migrateLoyaltyCard,
  getLpBalance,
  getLpLifetime,
  getRedeemableRewards,
  lpProgressPercent,
  lpToNextReward,
  levelByLp,
  canRedeemLpReward,
  getCategoryLpGain,
  getCategoryRewardCost,
  lpRewardStatusText,
  lpRemainingForReward
};

// Geri uyumluluk — eski import adları
export const STAMP_CATEGORIES = LP_CATEGORIES;
export const STAMP_SLOT_COUNT = LP_SLOT_COUNT;

export function normalizeCategoryStamps(card) {
  return migrateLoyaltyCard(card)?._legacy?.categoryStamps || emptyCategoryStamps();
}

export function normalizeCategoryRewards(card) {
  return migrateLoyaltyCard(card)?._legacy?.categoryRewards || emptyCategoryRewards();
}

export function countTotalRewards(card) {
  return getRedeemableRewards(migrateLoyaltyCard(card)).length;
}

export function countTotalStamps(card) {
  return getLpBalance(card);
}

export function getCategoryThreshold(categoryId) {
  return getCategoryRewardCost(categoryId);
}

export function categoryProgress(card, categoryId) {
  const balance = getLpBalance(card);
  return lpProgressPercent(balance, getCategoryRewardCost(categoryId));
}

export function stampCardProgress(card) {
  const balance = getLpBalance(card);
  const { tier } = lpToNextReward(balance);
  if (!tier) return 100;
  return lpProgressPercent(balance, tier.rewardCost);
}

export function stampsRemaining(card) {
  const { remaining } = lpToNextReward(getLpBalance(card));
  return remaining;
}

// Eski eşik fonksiyonu — LP'de kullanılmaz
export function applyCategoryThresholds(stamps, rewards) {
  return { categoryStamps: stamps, categoryRewards: rewards };
}

export const LOYALTY_RULES_TITLE = 'LP biriktir, dilediğin ikramı seç.';
export const LOYALTY_RULES_HIGHLIGHTS = [
  { label: '7 LP Kahve İkram', tone: 'coffee' },
  { label: '15 LP Tatlı İkram', tone: 'dessert' },
  { label: '25 LP Burger İkram', tone: 'burger' }
];
export const LOYALTY_RULES_DETAIL_SUFFIX = '';

export function getStampRulesText() {
  return `${BRAND_SLOGAN} ${LOYALTY_PROMO}`;
}

// LP kart özeti — UI bileşenleri için
export function getLpCardView(card) {
  const normalized = migrateLoyaltyCard(card);
  return {
    lpBalance: normalized?.lpBalance || 0,
    lpLifetime: normalized?.lpLifetime || 0,
    level: normalized?.level || levelByLp(normalized?.lpLifetime || 0),
    redeemable: getRedeemableRewards(normalized)
  };
}

// İşlem geçmişi etiketleri — LP ve eski kayıtlar
export function historyTypeLabel(type) {
  return {
    lp_add: 'LP kazanıldı',
    lp_remove: 'LP düzeltildi',
    lp_reward_redeem: 'İkram kullanıldı',
    earn_coffee: 'Kahve satışı',
    earn_dessert: 'Tatlı satışı',
    earn_burger: 'Burger satışı',
    redeem_coffee: 'Kahve ikram',
    redeem_dessert: 'Tatlı ikram',
    redeem_burger: 'Burger ikram',
    stamp_add: 'LP kazanıldı',
    stamp_remove: 'LP düzeltildi',
    reward_redeem: 'Ödül kullanıldı',
    birthday_reward: 'Doğum günü hediyesi',
    welcome_bonus: 'Hoş geldin bonusu',
    google_review_bonus: 'Google yorum bonusu',
    google_review_request: 'Yorum onay talebi',
    referral_bonus: 'Referans bonusu',
    wheel_spin: 'Şans çarkı',
    daily_login: 'Günlük giriş ödülü',
    first_order_bonus: 'İlk sipariş bonusu',
    check_in: 'Check-in',
    coupon_use: 'Kupon kullanıldı',
    login: 'Giriş yapıldı',
    register: 'Kayıt oluşturuldu'
  }[type] || 'İşlem';
}

// Geçmiş satırındaki LP miktarı
export function historyAmountLabel(entry) {
  const redeemTypes = ['lp_reward_redeem', 'reward_redeem', 'redeem_coffee', 'redeem_dessert', 'redeem_burger'];
  const earnTypes = ['lp_add', 'stamp_add', 'earn_coffee', 'earn_dessert', 'earn_burger'];

  if (redeemTypes.includes(entry.type)) {
    return `-${entry.count || 0} LP`;
  }
  if (earnTypes.includes(entry.type)) {
    return `+${entry.count || 0} LP`;
  }
  if (entry.type === 'lp_remove' || entry.type === 'stamp_remove') {
    return `-${entry.count || 0} LP`;
  }
  if (entry.type === 'birthday_reward') return '+7 LP';
  if (entry.type === 'google_review_bonus') return '+3 LP';
  if (entry.count > 0) return `+${entry.count}`;
  return entry.count || '•';
}
