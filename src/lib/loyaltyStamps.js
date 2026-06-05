// Kategori damgaları — sıra: tatlı, kahve, burger
export const STAMP_CATEGORIES = [
  {
    id: 'dessert',
    label: 'Tatlı',
    shortLabel: 'Tatlı',
    image: '/stamps/dessert.png?v=7',
    imagePosition: 'center center',
    threshold: 6,
    rewardLabel: '1 ikram tatlı',
    ikramShort: 'Tatlı ikramı'
  },
  {
    id: 'coffee',
    label: 'Kahve',
    shortLabel: 'Kahve',
    image: '/stamps/coffee.png?v=7',
    imagePosition: 'center center',
    threshold: 6,
    rewardLabel: '1 ikram içecek',
    ikramShort: 'Kahve ikramı'
  },
  {
    id: 'burger',
    label: 'Burger',
    shortLabel: 'Burger',
    image: '/stamps/burger.png?v=7',
    imagePosition: 'center center',
    threshold: 12,
    rewardLabel: '1 ikram burger',
    ikramShort: 'Burger ikramı'
  }
];

export const STAMP_SLOT_COUNT = STAMP_CATEGORIES.length;

// Boş damga sayaçları
export function emptyCategoryStamps() {
  return { dessert: 0, coffee: 0, burger: 0 };
}

// Boş kategori ikram hakları
export function emptyCategoryRewards() {
  return { dessert: 0, coffee: 0, burger: 0 };
}

// Damga sayaçlarını normalize eder
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

// Kategori ikram haklarını normalize eder
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

// Toplam kullanılabilir ikram
export function countTotalRewards(rewards) {
  return STAMP_CATEGORIES.reduce((sum, cat) => sum + (rewards[cat.id] || 0), 0);
}

// Toplam aktif damga
export function countTotalStamps(stamps) {
  return STAMP_CATEGORIES.reduce((sum, cat) => sum + (stamps[cat.id] || 0), 0);
}

// Kategori eşiğini döndürür
export function getCategoryThreshold(categoryId) {
  return STAMP_CATEGORIES.find((cat) => cat.id === categoryId)?.threshold || 6;
}

// Kategori ilerleme yüzdesi
export function categoryProgress(stamps, categoryId) {
  const threshold = getCategoryThreshold(categoryId);
  const count = stamps[categoryId] || 0;
  return Math.min(100, Math.round((count / threshold) * 100));
}

// Genel kart ilerlemesi — kategorilerin ortalaması
export function stampCardProgress(stamps) {
  const total = STAMP_CATEGORIES.reduce((sum, cat) => sum + categoryProgress(stamps, cat.id), 0);
  return Math.round(total / STAMP_SLOT_COUNT);
}

// Bir sonraki ikrama kalan damga (en yakın kategori)
export function stampsRemaining(stamps) {
  const remainders = STAMP_CATEGORIES.map((cat) => Math.max(0, cat.threshold - (stamps[cat.id] || 0)));
  return Math.min(...remainders);
}

// Eşik aşıldığında ikram hakkı üretir
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

// Sadakat programı tanıtım metinleri
export const LOYALTY_RULES_TITLE = 'Liberte’de müdavim olmak kazandırır.';
export const LOYALTY_RULES_HIGHLIGHTS = [
  { label: '6. kahven', tone: 'coffee' },
  { label: '6. tatlın', tone: 'dessert' },
  { label: '12. burgerin', tone: 'burger' }
];
export const LOYALTY_RULES_DETAIL_SUFFIX = 'bizden.';

// Kurallar metni — tek satır özet (geri uyumluluk)
export function getStampRulesText() {
  const detail = LOYALTY_RULES_HIGHLIGHTS.map((item) => item.label).join(', ');
  return `${LOYALTY_RULES_TITLE} ${detail} ${LOYALTY_RULES_DETAIL_SUFFIX}`;
}
