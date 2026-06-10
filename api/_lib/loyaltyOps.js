import { listCustomers } from './customerEmails.js';
import {
  STAMP_CATEGORIES,
  applyCategoryThresholds,
  countTotalRewards,
  countTotalStamps,
  levelByStamps,
  normalizeCategoryRewards,
  normalizeCategoryStamps
} from './loyaltyStampsServer.js';

// Yeni müşteri sadakat şablonu
export function loyaltyTemplate(id) {
  return {
    customerId: id,
    totalStamps: 0,
    categoryStamps: { coffee: 0, dessert: 0, burger: 0 },
    categoryRewards: { coffee: 0, dessert: 0, burger: 0 },
    availableRewards: 0,
    usedRewards: 0,
    lifetimeStamps: 0,
    level: 'Bronze'
  };
}

// Kategoriye damga ekle veya çıkar — sunucu state üzerinde
export function applyCategoryStamp(state, customerId, category, count = 1, source = 'Kasa QR') {
  const id = Number(customerId);
  const customer = listCustomers(state).find((row) => Number(row.id) === id);
  if (!customer) return { ok: false, error: 'Müşteri bulunamadı' };

  const valid = STAMP_CATEGORIES.some((cat) => cat.id === category);
  if (!valid) return { ok: false, error: 'Geçersiz kategori' };

  const steps = Math.abs(Math.trunc(count));
  if (!steps) return { ok: false, error: 'Damga adedi geçersiz' };

  const sign = count >= 0 ? 1 : -1;
  const current = state.loyalty?.[id] || state.loyalty?.[String(id)] || loyaltyTemplate(id);
  const oldStamps = normalizeCategoryStamps(current);
  const oldRewards = normalizeCategoryRewards(current);
  const oldLifetime = current.lifetimeStamps || 0;
  const nextStamps = { ...oldStamps };
  const nextRewards = { ...oldRewards };

  if (sign > 0) {
    nextStamps[category] = (nextStamps[category] || 0) + steps;
  } else {
    nextStamps[category] = Math.max(0, (nextStamps[category] || 0) - steps);
  }

  const thresholded = applyCategoryThresholds(nextStamps, nextRewards);
  const totalStamps = countTotalStamps(thresholded.categoryStamps);
  const availableRewards = countTotalRewards(thresholded.categoryRewards);
  const lifetime = Math.max(0, oldLifetime + (sign > 0 ? steps : 0));
  const createdAt = new Date().toLocaleString('tr-TR');
  const catLabel = STAMP_CATEGORIES.find((cat) => cat.id === category)?.label || category;

  const nextCard = {
    ...current,
    totalStamps,
    categoryStamps: thresholded.categoryStamps,
    categoryRewards: thresholded.categoryRewards,
    availableRewards,
    lifetimeStamps: lifetime,
    level: levelByStamps(lifetime),
    updatedAt: createdAt
  };

  state.loyalty = { ...(state.loyalty || {}), [id]: nextCard };
  state.history = [
    {
      id: Date.now(),
      customerId: id,
      name: customer.name,
      phone: customer.phone,
      type: sign > 0 ? 'stamp_add' : 'stamp_remove',
      count: steps,
      category,
      categoryLabel: catLabel,
      before: {
        categoryStamps: oldStamps,
        categoryRewards: oldRewards,
        lifetimeStamps: oldLifetime
      },
      after: {
        categoryStamps: thresholded.categoryStamps,
        categoryRewards: thresholded.categoryRewards,
        lifetimeStamps: lifetime
      },
      source,
      createdAt
    },
    ...(state.history || [])
  ];

  return { ok: true, loyalty: nextCard };
}

// Kategori ikramı kullan
export function redeemCategoryReward(state, customerId, category, source = 'QR kasiyer') {
  const id = Number(customerId);
  const customer = listCustomers(state).find((row) => Number(row.id) === id);
  if (!customer) return { ok: false, error: 'Müşteri bulunamadı' };

  const valid = STAMP_CATEGORIES.some((cat) => cat.id === category);
  if (!valid) return { ok: false, error: 'Geçersiz kategori' };

  const current = state.loyalty?.[id] || state.loyalty?.[String(id)] || loyaltyTemplate(id);
  const categoryRewards = normalizeCategoryRewards(current);
  const count = categoryRewards[category] || 0;
  const catLabel = STAMP_CATEGORIES.find((cat) => cat.id === category)?.label || category;

  if (count <= 0) {
    return { ok: false, error: `Kullanılabilir ${catLabel.toLowerCase()} ikram hakkı yok.` };
  }

  categoryRewards[category] = count - 1;
  const availableRewards = countTotalRewards(categoryRewards);
  const createdAt = new Date().toLocaleString('tr-TR');
  const nextCard = {
    ...current,
    categoryRewards,
    availableRewards,
    usedRewards: (current.usedRewards || 0) + 1,
    updatedAt: createdAt
  };

  state.loyalty = { ...(state.loyalty || {}), [id]: nextCard };
  state.history = [
    {
      id: Date.now(),
      customerId: id,
      name: customer.name,
      phone: customer.phone,
      type: 'reward_redeem',
      count: 1,
      category,
      categoryLabel: catLabel,
      reward: STAMP_CATEGORIES.find((cat) => cat.id === category)?.rewardLabel || 'İkram',
      before: {
        categoryRewards: normalizeCategoryRewards(current),
        availableRewards: current.availableRewards || 0,
        usedRewards: current.usedRewards || 0
      },
      after: {
        categoryRewards,
        availableRewards,
        usedRewards: nextCard.usedRewards
      },
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
    return applyCategoryStamp(state, id, 'coffee', 1, '5 ziyaret bonusu');
  }

  return { ok: true };
}

// Müşteri özetini döndür
export function customerSummary(state, customerId) {
  const id = Number(customerId);
  const customer = listCustomers(state).find((row) => Number(row.id) === id);
  if (!customer) return null;

  const loyalty = state.loyalty?.[id] || state.loyalty?.[String(id)] || loyaltyTemplate(id);
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email || '',
    loyalty
  };
}
