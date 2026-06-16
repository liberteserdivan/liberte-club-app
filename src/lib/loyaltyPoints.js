// Liberte Puan (LP) — birleşik sadakat sistemi

export const LP_SCHEMA_VERSION = 2;

export const LP_WEIGHTS = {
  coffee: 1,
  dessert: 2,
  burger: 3
};

export const LP_REWARD_COSTS = {
  coffee: 7,
  dessert: 15,
  burger: 25
};

// İşlem geçmişi türleri
export const LP_HISTORY_EARN = {
  coffee: 'earn_coffee',
  dessert: 'earn_dessert',
  burger: 'earn_burger'
};

export const LP_HISTORY_REDEEM = {
  coffee: 'redeem_coffee',
  dessert: 'redeem_dessert',
  burger: 'redeem_burger'
};

// Kategori tanımları — kasiyer ve müşteri arayüzü
export const LP_CATEGORIES = [
  {
    id: 'coffee',
    label: 'Kahve',
    shortLabel: 'Kahve',
    lpGain: 1,
    rewardCost: 7,
    threshold: 7,
    redeemTitle: 'Kahve İkram',
    rewardLabel: '7 LP Kahve İkram',
    image: '/stamps/coffee.png?v=8',
    imagePosition: 'center center'
  },
  {
    id: 'dessert',
    label: 'Tatlı',
    shortLabel: 'Tatlı',
    lpGain: 2,
    rewardCost: 15,
    threshold: 15,
    redeemTitle: 'Tatlı İkram',
    rewardLabel: '15 LP Tatlı İkram',
    image: '/stamps/dessert.png?v=8',
    imagePosition: 'center center'
  },
  {
    id: 'burger',
    label: 'Burger',
    shortLabel: 'Burger',
    lpGain: 3,
    rewardCost: 25,
    threshold: 25,
    redeemTitle: 'Burger İkram',
    rewardLabel: '25 LP Burger İkram',
    image: '/stamps/burger.png?v=8',
    imagePosition: 'center center'
  }
];

export const LP_SLOT_COUNT = LP_CATEGORIES.length;

// Eski damga alanları — geri uyumluluk için boş şablon
export function emptyCategoryStamps() {
  return { dessert: 0, coffee: 0, burger: 0 };
}

export function emptyCategoryRewards() {
  return { dessert: 0, coffee: 0, burger: 0 };
}

// Eski karttan damga oku (migration öncesi)
function readLegacyStamps(card) {
  if (card?.categoryStamps) {
    return {
      dessert: Math.max(0, Math.trunc(card.categoryStamps.dessert || 0)),
      coffee: Math.max(0, Math.trunc(card.categoryStamps.coffee || 0)),
      burger: Math.max(0, Math.trunc(card.categoryStamps.burger || 0))
    };
  }

  const legacy = Math.max(0, Math.trunc(card?.totalStamps || 0));
  const next = emptyCategoryStamps();
  if (legacy > 0) next.coffee = legacy;
  return next;
}

function readLegacyRewards(card) {
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

// Eski damgaları LP'ye dönüştür — tek seferlik migration
export function convertLegacyToLp(stamps, rewards) {
  const fromStamps =
    (stamps.coffee || 0) * LP_WEIGHTS.coffee
    + (stamps.dessert || 0) * LP_WEIGHTS.dessert
    + (stamps.burger || 0) * LP_WEIGHTS.burger;

  const fromRewards =
    (rewards.coffee || 0) * LP_REWARD_COSTS.coffee
    + (rewards.dessert || 0) * LP_REWARD_COSTS.dessert
    + (rewards.burger || 0) * LP_REWARD_COSTS.burger;

  return fromStamps + fromRewards;
}

// Kartı LP şemasına taşı — eski alanları silmez
export function migrateLoyaltyCard(card) {
  if (!card) return null;

  if (Number(card.schemaVersion) >= LP_SCHEMA_VERSION) {
    const lpBalance = Math.max(0, Math.trunc(card.lpBalance || 0));
    const lpLifetime = Math.max(lpBalance, Math.trunc(card.lpLifetime || 0));
    return {
      ...card,
      schemaVersion: LP_SCHEMA_VERSION,
      lpBalance,
      lpLifetime,
      level: levelByLp(lpLifetime)
    };
  }

  const legacyStamps = readLegacyStamps(card);
  const legacyRewards = readLegacyRewards(card);
  const lpBalance = convertLegacyToLp(legacyStamps, legacyRewards);
  const lpLifetime = Math.max(
    Math.trunc(card.lifetimeStamps || 0),
    lpBalance,
    Math.trunc(card.lpLifetime || 0)
  );

  return {
    ...card,
    schemaVersion: LP_SCHEMA_VERSION,
    lpBalance,
    lpLifetime,
    usedRewards: Math.max(0, Math.trunc(card.usedRewards || 0)),
    level: levelByLp(lpLifetime),
    _legacy: {
      categoryStamps: legacyStamps,
      categoryRewards: legacyRewards,
      totalStamps: card.totalStamps,
      availableRewards: card.availableRewards,
      lifetimeStamps: card.lifetimeStamps
    },
    categoryStamps: emptyCategoryStamps(),
    categoryRewards: emptyCategoryRewards(),
    totalStamps: 0,
    availableRewards: 0,
    lifetimeStamps: lpLifetime
  };
}

// Tüm loyalty kayıtlarını migrate et
export function migrateAllLoyalty(loyalty = {}) {
  const next = {};
  Object.entries(loyalty || {}).forEach(([id, card]) => {
    next[id] = migrateLoyaltyCard(card);
  });
  return next;
}

export function getLpBalance(card) {
  return migrateLoyaltyCard(card)?.lpBalance || 0;
}

export function getLpLifetime(card) {
  return migrateLoyaltyCard(card)?.lpLifetime || 0;
}

export function getCategoryLpGain(categoryId) {
  return LP_WEIGHTS[categoryId] || 0;
}

export function getCategoryRewardCost(categoryId) {
  return LP_REWARD_COSTS[categoryId] || 0;
}

export function canRedeemLpReward(card, categoryId) {
  const normalized = migrateLoyaltyCard(card);
  const cost = getCategoryRewardCost(categoryId);
  return (normalized?.lpBalance || 0) >= cost;
}

export function getRedeemableRewards(card) {
  const balance = getLpBalance(card);
  return LP_CATEGORIES.filter((cat) => balance >= cat.rewardCost);
}

// İkram için kalan LP
export function lpRemainingForReward(balance, categoryId) {
  const cost = getCategoryRewardCost(categoryId);
  return Math.max(0, cost - Math.max(0, Number(balance || 0)));
}

// Müşteri kartı — ikram durum metni
export function lpRewardStatusText(card, category) {
  if (canRedeemLpReward(card, category.id)) return 'Kullanılabilir';
  const remaining = lpRemainingForReward(getLpBalance(card), category.id);
  return `${category.redeemTitle || category.label} ikram için ${remaining} LP kaldı.`;
}

// Bir sonraki kazanılabilir ödüle kalan LP
export function lpToNextReward(balance) {
  const sorted = [...LP_CATEGORIES].sort((a, b) => a.rewardCost - b.rewardCost);
  for (const tier of sorted) {
    if (balance < tier.rewardCost) {
      return { tier, remaining: tier.rewardCost - balance };
    }
  }
  return { tier: null, remaining: 0 };
}

export function lpProgressPercent(balance, targetCost) {
  if (!targetCost) return 100;
  return Math.min(100, Math.round((balance / targetCost) * 100));
}

export function levelByLp(total) {
  const n = Number(total || 0);
  if (n >= 90) return 'Black';
  if (n >= 50) return 'Gold';
  if (n >= 20) return 'Silver';
  return 'Bronze';
}
