export {
  LP_CATEGORIES,
  LP_HISTORY_EARN,
  LP_HISTORY_REDEEM,
  migrateLoyaltyCard,
  getCategoryLpGain,
  getCategoryRewardCost,
  canRedeemLpReward,
  levelByLp,
  migrateAllLoyalty
} from '../../src/lib/loyaltyPoints.js';

import { LP_CATEGORIES as CATEGORIES } from '../../src/lib/loyaltyPoints.js';
import {
  migrateLoyaltyCard,
  levelByLp
} from '../../src/lib/loyaltyPoints.js';

export const STAMP_CATEGORIES = CATEGORIES;

export function emptyCategoryStamps() {
  return { dessert: 0, coffee: 0, burger: 0 };
}

export function emptyCategoryRewards() {
  return { dessert: 0, coffee: 0, burger: 0 };
}

export function normalizeCategoryStamps(card) {
  return migrateLoyaltyCard(card)?._legacy?.categoryStamps || emptyCategoryStamps();
}

export function normalizeCategoryRewards(card) {
  return migrateLoyaltyCard(card)?._legacy?.categoryRewards || emptyCategoryRewards();
}

export function countTotalRewards(card) {
  const balance = migrateLoyaltyCard(card)?.lpBalance || 0;
  return CATEGORIES.filter((cat) => balance >= cat.rewardCost).length;
}

export function countTotalStamps(card) {
  return migrateLoyaltyCard(card)?.lpBalance || 0;
}

export function applyCategoryThresholds(stamps, rewards) {
  return { categoryStamps: stamps, categoryRewards: rewards };
}

export function levelByStamps(total) {
  return levelByLp(total);
}
