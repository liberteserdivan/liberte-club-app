// Sunucu sadakat hesapları — istemci loyaltyStamps.js ile uyumlu

export const STAMP_CATEGORIES = [
  { id: 'dessert', label: 'Tatlı', threshold: 6, rewardLabel: '1 ikram tatlı' },
  { id: 'coffee', label: 'Kahve', threshold: 6, rewardLabel: '1 ikram içecek' },
  { id: 'burger', label: 'Burger', threshold: 12, rewardLabel: '1 ikram burger' }
];

export function emptyCategoryStamps() {
  return { dessert: 0, coffee: 0, burger: 0 };
}

export function emptyCategoryRewards() {
  return { dessert: 0, coffee: 0, burger: 0 };
}

export function normalizeCategoryStamps(card) {
  if (card?.categoryStamps) {
    return {
      dessert: Math.max(0, Math.trunc(card.categoryStamps.dessert || 0)),
      coffee: Math.max(0, Math.trunc(card.categoryStamps.coffee || 0)),
      burger: Math.max(0, Math.trunc(card.categoryStamps.burger || 0))
    };
  }

  const legacy = Math.max(0, Math.trunc(card?.totalStamps || 0));
  const next = emptyCategoryStamps();
  if (legacy > 0) next.coffee = Math.min(STAMP_CATEGORIES[1].threshold - 1, legacy);
  return next;
}

export function normalizeCategoryRewards(card) {
  if (card?.categoryRewards) {
    return {
      dessert: Math.max(0, Math.trunc(card.categoryRewards.dessert || 0)),
      coffee: Math.max(0, Math.trunc(card.categoryRewards.coffee || 0)),
      burger: Math.max(0, Math.trunc(card.categoryRewards.burger || 0))
    };
  }

  const legacy = Math.max(0, Math.trunc(card?.availableRewards || 0));
  return { dessert: 0, coffee: legacy, burger: 0 };
}

export function countTotalRewards(rewards) {
  return STAMP_CATEGORIES.reduce((sum, cat) => sum + (rewards[cat.id] || 0), 0);
}

export function countTotalStamps(stamps) {
  return STAMP_CATEGORIES.reduce((sum, cat) => sum + (stamps[cat.id] || 0), 0);
}

export function applyCategoryThresholds(stamps, rewards) {
  const nextStamps = { ...stamps };
  const nextRewards = { ...rewards };

  STAMP_CATEGORIES.forEach((cat) => {
    while ((nextStamps[cat.id] || 0) >= cat.threshold) {
      nextStamps[cat.id] -= cat.threshold;
      nextRewards[cat.id] = (nextRewards[cat.id] || 0) + 1;
    }
  });

  return { categoryStamps: nextStamps, categoryRewards: nextRewards };
}

export function levelByStamps(total) {
  const n = Number(total || 0);
  if (n >= 90) return 'Black';
  if (n >= 50) return 'Gold';
  if (n >= 20) return 'Silver';
  return 'Bronze';
}
