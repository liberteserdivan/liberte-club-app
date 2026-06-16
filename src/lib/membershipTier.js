// Üyelik seviye sistemi — toplam kazanılan LP ile belirlenir
import { getLevelProgress, levelByLp, migrateLoyaltyCard } from './loyaltyPoints.js';

// Seviye indirim oranları — Bronze'da yok
export const TIER_DISCOUNT_PERCENT = {
  Bronze: 0,
  Silver: 5,
  Gold: 10,
  Black: 15
};

// Seviye renk sınıfları — CSS ile eşleşir
export const TIER_TONE = {
  Bronze: 'bronze',
  Silver: 'silver',
  Gold: 'gold',
  Black: 'black'
};

// Ay anahtarı — aylık indirim takibi
export function currentMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Doğum günü bugün mü — YYYY-MM-DD
export function isBirthdayToday(birthDate, date = new Date()) {
  if (!birthDate) return false;
  const parts = String(birthDate).split('-');
  if (parts.length < 3) return false;
  return Number(parts[1]) === date.getMonth() + 1 && Number(parts[2]) === date.getDate();
}

// Bu ay indirim kullanıldı mı
export function isMonthlyDiscountUsed(card, monthKey = currentMonthKey()) {
  const normalized = migrateLoyaltyCard(card);
  return String(normalized?.monthlyDiscountMonth || '') === monthKey;
}

// Seviye indirim yüzdesi
export function getTierDiscountPercent(level) {
  return TIER_DISCOUNT_PERCENT[level] || 0;
}

// Aylık indirim kullanılabilir mi
export function canUseMonthlyDiscount(card, level = 'Bronze') {
  const percent = getTierDiscountPercent(level);
  if (!percent) return false;
  return !isMonthlyDiscountUsed(card, currentMonthKey());
}

// Doğum günü kahvesi bu yıl kullanıldı mı
export function isBirthdayCoffeeUsed(history = [], customerId, year = new Date().getFullYear()) {
  return (history || []).some(
    (row) => Number(row.customerId) === Number(customerId)
      && (row.type === 'birthday_coffee' || row.type === 'birthday_reward')
      && Number(row.year) === year
  );
}

// Doğum günü kahvesi durumu
export function getBirthdayCoffeeStatus(customer, history = []) {
  const year = new Date().getFullYear();
  const used = isBirthdayCoffeeUsed(history, customer?.id, year);

  if (!customer?.birthDate) {
    return {
      available: false,
      used,
      label: 'Doğum tarihi profilde tanımlı değil',
      hint: 'Doğum günü kahvesi için doğum tarihi eklenmelidir.'
    };
  }

  if (used) {
    return {
      available: false,
      used: true,
      label: 'Bu yıl kullanıldı',
      hint: 'Doğum gününde 1 kahve ikramı tüm üyeler için geçerlidir.'
    };
  }

  if (!isBirthdayToday(customer.birthDate)) {
    return {
      available: false,
      used: false,
      label: 'Doğum gününde geçerli',
      hint: 'Doğum gününde 1 kahve ikramı tüm üyeler için geçerlidir.'
    };
  }

  return {
    available: true,
    used: false,
    label: 'Bugün kullanılabilir',
    hint: 'Doğum gününde 1 kahve ikramı tüm üyeler için geçerlidir.'
  };
}

// Seviye avantaj metinleri — müşteri arayüzü
export function tierBenefits(level = 'Bronze') {
  const map = {
    Bronze: [
      'Standart üyelik',
      'Standart LP kazanımı'
    ],
    Silver: [
      'Ayda 1 kez %5 indirim',
      'Özel kampanyaları erken görme'
    ],
    Gold: [
      'Ayda 1 kez %10 indirim',
      'Özel kampanyalar',
      'Yeni ürün duyurularına erken erişim'
    ],
    Black: [
      'Ayda 1 kez %15 indirim',
      'Belirli günlerde çift LP kampanyaları',
      'VIP kampanyalar / sürpriz ikramlar'
    ]
  };
  return map[level] || map.Bronze;
}

// Tüm üyeler için genel avantaj
export const UNIVERSAL_MEMBERSHIP_BENEFITS = [
  'Doğum gününde 1 kahve ikramı tüm üyeler için geçerlidir.'
];

// İndirim kuralları — bilgilendirme metni
export const TIER_DISCOUNT_RULES = [
  'Ayda 1 kez kullanılabilir.',
  'Kampanyalarla ve LP ikramlarıyla birleştirilemez.',
  'Sadece cafe içi alışverişlerde geçerlidir.'
];

// Üyelik özeti — UI ve kasiyer paneli
export function getMembershipView(card, customer = null, history = []) {
  const normalized = migrateLoyaltyCard(card);
  const lpBalance = normalized?.lpBalance || 0;
  const totalEarnedLp = normalized?.lpLifetime || 0;
  const level = normalized?.level || levelByLp(totalEarnedLp);
  const track = getLevelProgress(totalEarnedLp);
  const discountPercent = getTierDiscountPercent(level);
  const discountAvailable = canUseMonthlyDiscount(normalized, level);
  const birthdayCoffee = getBirthdayCoffeeStatus(customer, history);

  return {
    level,
    tierTone: TIER_TONE[level] || 'bronze',
    lpBalance,
    totalEarnedLp,
    nextLevel: track.nextLevel,
    remainingToNext: track.remaining,
    levelProgress: track.progress,
    benefits: tierBenefits(level),
    universalBenefits: UNIVERSAL_MEMBERSHIP_BENEFITS,
    discountPercent,
    discountAvailable,
    discountUsedThisMonth: isMonthlyDiscountUsed(normalized),
    discountRules: TIER_DISCOUNT_RULES,
    birthdayCoffee,
    levelLabel: `${level} seviyesindesin`
  };
}
