import { listCustomers } from './customerEmails.js';
import {
  LP_CATEGORIES,
  migrateLoyaltyCard,
  getCategoryLpGain,
  getCategoryRewardCost,
  canRedeemLpReward,
  levelByLp,
  LP_HISTORY_EARN,
  LP_HISTORY_REDEEM
} from './loyaltyPointsServer.js';
import { menuItems } from '../../src/lib/menuSeed.js';
import {
  assertMenuItemCanEarnLp,
  requiresProductPickForLpCategory
} from '../../src/lib/menuLp.js';
import {
  canUseMonthlyDiscount,
  currentMonthKey,
  getMembershipView,
  getTierDiscountPercent,
  isBirthdayCoffeeUsed
} from '../../src/lib/membershipTier.js';

// Yeni müşteri LP şablonu
export function loyaltyTemplate(id) {
  return migrateLoyaltyCard({
    customerId: id,
    schemaVersion: 2,
    lpBalance: 0,
    lpLifetime: 0,
    usedRewards: 0,
    level: 'Bronze',
    categoryStamps: { coffee: 0, dessert: 0, burger: 0 },
    categoryRewards: { coffee: 0, dessert: 0, burger: 0 },
    totalStamps: 0,
    availableRewards: 0,
    lifetimeStamps: 0
  });
}

// Kategori işlemine göre LP ekle veya çıkar
export function applyCategoryStamp(state, customerId, category, count = 1, source = 'Kasa QR', options = {}) {
  const id = Number(customerId);
  const customer = listCustomers(state).find((row) => Number(row.id) === id);
  if (!customer) return { ok: false, error: 'Müşteri bulunamadı' };

  const steps = Math.abs(Math.trunc(count));
  if (!steps) return { ok: false, error: 'İşlem adedi geçersiz' };

  const sign = count >= 0 ? 1 : -1;
  const menuItem = options.menuItem || null;

  if (sign > 0) {
    if (menuItem) {
      const check = assertMenuItemCanEarnLp(menuItem);
      if (!check.ok) return { ok: false, error: check.error };
      category = check.category;
    } else if (requiresProductPickForLpCategory(category, menuItems)) {
      return { ok: false, error: 'Bu kategori için ürün seçimi gerekli' };
    }
  }

  const valid = LP_CATEGORIES.some((cat) => cat.id === category);
  if (!valid) return { ok: false, error: 'Geçersiz kategori' };
  const lpGain = getCategoryLpGain(category) * steps;
  const current = migrateLoyaltyCard(state.loyalty?.[id] || state.loyalty?.[String(id)] || loyaltyTemplate(id));
  const oldBalance = current.lpBalance || 0;
  const oldLifetime = current.lpLifetime || 0;

  if (sign < 0 && oldBalance < lpGain) {
    return { ok: false, error: 'Yetersiz LP' };
  }

  const nextBalance = Math.max(0, sign > 0 ? oldBalance + lpGain : oldBalance - lpGain);
  const nextLifetime = sign > 0 ? oldLifetime + lpGain : oldLifetime;
  const createdAt = new Date().toLocaleString('tr-TR');
  const catLabel = LP_CATEGORIES.find((cat) => cat.id === category)?.label || category;

  const nextCard = {
    ...current,
    lpBalance: nextBalance,
    lpLifetime: nextLifetime,
    level: levelByLp(nextLifetime),
    updatedAt: createdAt
  };

  state.loyalty = { ...(state.loyalty || {}), [id]: nextCard };
  const earnType = LP_HISTORY_EARN[category] || (sign > 0 ? 'lp_add' : 'lp_remove');

  state.history = [
    {
      id: Date.now(),
      customerId: id,
      name: customer.name,
      phone: customer.phone,
      type: sign > 0 ? earnType : 'lp_remove',
      count: lpGain,
      category,
      categoryLabel: catLabel,
      menuItemId: menuItem?.id || null,
      menuItemName: menuItem?.name || null,
      lpBefore: oldBalance,
      lpAfter: nextBalance,
      before: { lpBalance: oldBalance, lpLifetime: oldLifetime },
      after: { lpBalance: nextBalance, lpLifetime: nextLifetime },
      source,
      createdAt
    },
    ...(state.history || [])
  ];

  return { ok: true, loyalty: nextCard };
}

// LP ödülü kullan
export function redeemCategoryReward(state, customerId, category, source = 'QR kasiyer') {
  const id = Number(customerId);
  const customer = listCustomers(state).find((row) => Number(row.id) === id);
  if (!customer) return { ok: false, error: 'Müşteri bulunamadı' };

  const valid = LP_CATEGORIES.some((cat) => cat.id === category);
  if (!valid) return { ok: false, error: 'Geçersiz ödül' };

  const current = migrateLoyaltyCard(state.loyalty?.[id] || state.loyalty?.[String(id)] || loyaltyTemplate(id));
  const cost = getCategoryRewardCost(category);
  const catLabel = LP_CATEGORIES.find((cat) => cat.id === category)?.label || category;

  if (!canRedeemLpReward(current, category)) {
    return { ok: false, error: 'Yetersiz LP' };
  }

  const oldBalance = current.lpBalance || 0;
  const nextBalance = Math.max(0, oldBalance - cost);
  const createdAt = new Date().toLocaleString('tr-TR');
  const nextCard = {
    ...current,
    lpBalance: nextBalance,
    usedRewards: (current.usedRewards || 0) + 1,
    updatedAt: createdAt
  };

  state.loyalty = { ...(state.loyalty || {}), [id]: nextCard };
  const redeemType = LP_HISTORY_REDEEM[category] || 'lp_reward_redeem';

  state.history = [
    {
      id: Date.now(),
      customerId: id,
      name: customer.name,
      phone: customer.phone,
      type: redeemType,
      count: cost,
      category,
      categoryLabel: catLabel,
      reward: LP_CATEGORIES.find((cat) => cat.id === category)?.rewardLabel || 'İkram',
      lpBefore: oldBalance,
      lpAfter: nextBalance,
      before: { lpBalance: oldBalance, usedRewards: current.usedRewards || 0 },
      after: { lpBalance: nextBalance, usedRewards: nextCard.usedRewards },
      source,
      createdAt
    },
    ...(state.history || [])
  ];

  return { ok: true, loyalty: nextCard };
}

// Check-in kaydı
export function applyCheckIn(state, customerId, source = 'Kasa QR check-in') {
  const id = Number(customerId);
  const customer = listCustomers(state).find((row) => Number(row.id) === id);
  if (!customer) return { ok: false, error: 'Müşteri bulunamadı' };

  const today = new Date().toLocaleDateString('tr-TR');
  const already = (state.checkIns || []).some(
    (row) => row.customerId === id && String(row.date) === today
  );
  if (already) return { ok: false, error: 'Bu müşteri bugün zaten check-in yaptı.' };

  const createdAt = new Date().toLocaleString('tr-TR');
  state.customers = listCustomers(state).map((row) => (
    Number(row.id) === id ? { ...row, lastVisit: createdAt } : row
  ));
  state.checkIns = [
    {
      id: Date.now(),
      customerId: id,
      name: customer.name,
      phone: customer.phone,
      date: today,
      createdAt,
      source
    },
    ...(state.checkIns || [])
  ];
  state.history = [
    {
      id: Date.now() + 1,
      customerId: id,
      name: customer.name,
      phone: customer.phone,
      type: 'check_in',
      count: 0,
      source,
      createdAt
    },
    ...(state.history || [])
  ];

  const visits = (state.checkIns || []).filter((row) => row.customerId === id).length;
  if (visits > 0 && visits % 5 === 0) {
    return applyCategoryStamp(state, id, 'coffee', 1, '5 ziyaret bonusu (+1 LP)');
  }

  return { ok: true };
}

// Doğum günü otomatik LP bonusu kaldırıldı — doğum günü kahvesi kasiyer uygular
export function applyBirthdayReward(state, customerId) {
  return { ok: true, changed: false };
}

// Seviye indirimi — ayda bir kez
export function applyTierDiscount(state, customerId, source = 'QR kasiyer') {
  const id = Number(customerId);
  const customer = listCustomers(state).find((row) => Number(row.id) === id);
  if (!customer) return { ok: false, error: 'Müşteri bulunamadı' };

  const current = migrateLoyaltyCard(state.loyalty?.[id] || state.loyalty?.[String(id)] || loyaltyTemplate(id));
  const level = current.level || levelByLp(current.lpLifetime || 0);
  const percent = getTierDiscountPercent(level);

  if (!percent) return { ok: false, error: 'Bu seviyede indirim hakkı yok.' };
  if (!canUseMonthlyDiscount(current, level)) {
    return { ok: false, error: 'Bu ay indirim hakkı zaten kullanıldı.' };
  }

  const monthKey = currentMonthKey();
  const createdAt = new Date().toLocaleString('tr-TR');
  const nextCard = {
    ...current,
    monthlyDiscountMonth: monthKey,
    updatedAt: createdAt
  };

  state.loyalty = { ...(state.loyalty || {}), [id]: nextCard };
  state.history = [
    {
      id: Date.now() + 72,
      customerId: id,
      name: customer.name,
      phone: customer.phone,
      type: 'tier_discount',
      count: percent,
      reward: `${level} seviye indirimi %${percent}`,
      month: monthKey,
      level,
      source,
      createdAt
    },
    ...(state.history || [])
  ];

  return { ok: true, loyalty: nextCard };
}

// Doğum günü kahvesi — yılda bir kez
export function applyBirthdayCoffee(state, customerId, source = 'QR kasiyer') {
  const id = Number(customerId);
  const customer = listCustomers(state).find((row) => Number(row.id) === id);
  if (!customer) return { ok: false, error: 'Müşteri bulunamadı' };

  const year = new Date().getFullYear();
  if (isBirthdayCoffeeUsed(state.history || [], id, year)) {
    return { ok: false, error: 'Doğum günü kahvesi bu yıl zaten kullanıldı.' };
  }

  if (!customer.birthDate) {
    return { ok: false, error: 'Müşterinin doğum tarihi tanımlı değil.' };
  }

  const parts = String(customer.birthDate).split('-');
  if (parts.length < 3) {
    return { ok: false, error: 'Geçersiz doğum tarihi.' };
  }

  const today = new Date();
  const isToday = Number(parts[1]) === today.getMonth() + 1 && Number(parts[2]) === today.getDate();
  if (!isToday) {
    return { ok: false, error: 'Doğum günü kahvesi yalnızca doğum gününde kullanılabilir.' };
  }

  const createdAt = new Date().toLocaleString('tr-TR');
  state.history = [
    {
      id: Date.now() + 73,
      customerId: id,
      name: customer.name,
      phone: customer.phone,
      type: 'birthday_coffee',
      count: 1,
      reward: 'Doğum günü kahve ikramı',
      year,
      source,
      createdAt
    },
    ...(state.history || [])
  ];

  return { ok: true };
}

// Müşteri özeti
export function customerSummary(state, customerId) {
  const id = Number(customerId);
  const customer = listCustomers(state).find((row) => Number(row.id) === id);
  if (!customer) return null;

  const loyalty = migrateLoyaltyCard(state.loyalty?.[id] || state.loyalty?.[String(id)] || loyaltyTemplate(id));
  const membership = getMembershipView(loyalty, customer, state.history || []);
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email || '',
    birthDate: customer.birthDate || '',
    loyalty,
    membership
  };
}
