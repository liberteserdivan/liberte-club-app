// Cihaz önbelleğine yazılacak state — PII sızıntısını önler

const PUBLIC_SETTINGS_KEYS = [
  'cafe_name', 'app_name', 'bg', 'card', 'accent', 'font', 'logo',
  'hero_title', 'hero_subtitle', 'promo_text', 'reward_description',
  'stamp_threshold', 'review_popup', 'daily_popup', 'wheel_unlimited'
];

// Müşteri kaydından yönetici bayrağını çıkar
function sanitizeCustomer(customer) {
  if (!customer) return null;
  const { isAdmin, ...safe } = customer;
  return safe;
}

// Ayarlardan gizli alanları çıkar
function publicSettings(settings = {}) {
  const next = {};
  PUBLIC_SETTINGS_KEYS.forEach((key) => {
    if (settings[key] != null) next[key] = settings[key];
  });
  return next;
}

// customerId içeren satırları filtrele
function rowsForCustomer(list, customerId) {
  return (list || []).filter((row) => Number(row.customerId) === Number(customerId));
}

// Tek müşterinin güvenli state görünümü
function filterForCustomer(state, customerId) {
  if (!state || !customerId) return state;

  const customer = (state.customers || []).find((c) => Number(c.id) === Number(customerId));
  const loyaltyCard = state.loyalty?.[customerId] || state.loyalty?.[String(customerId)] || null;

  return {
    settings: publicSettings(state.settings),
    customers: customer ? [sanitizeCustomer(customer)] : [],
    loyalty: loyaltyCard ? { [customerId]: loyaltyCard } : {},
    categories: state.categories || [],
    items: state.items || [],
    notifications: state.notifications || [],
    campaigns: state.campaigns || [],
    dailyCampaign: state.dailyCampaign || null,
    wheelPrizes: state.wheelPrizes || [],
    coupons: (state.coupons || []).filter((c) => c.active !== false),
    history: rowsForCustomer(state.history, customerId),
    feedback: rowsForCustomer(state.feedback, customerId),
    pushSubscriptions: rowsForCustomer(state.pushSubscriptions, customerId),
    googleReviewRequests: rowsForCustomer(state.googleReviewRequests, customerId),
    dailyClaims: rowsForCustomer(state.dailyClaims, customerId),
    wheelSpins: rowsForCustomer(state.wheelSpins, customerId),
    firstOrderBonuses: rowsForCustomer(state.firstOrderBonuses, customerId),
    checkIns: rowsForCustomer(state.checkIns, customerId),
    couponUses: rowsForCustomer(state.couponUses, customerId),
    referrals: (state.referrals || []).filter(
      (row) => Number(row.customerId) === Number(customerId) || Number(row.referrerId) === Number(customerId)
    ),
    customerNotes: {},
    pushLog: [],
    automationLog: []
  };
}

// localStorage'a yazılacak güvenli state
export function prepareLocalState(db, { customerId, isAdmin, adminVerified } = {}) {
  if (!db) return db;

  // Yönetici tam müşteri listesini cihaza yazmasın
  if (isAdmin && adminVerified) {
    return filterForCustomer(db, customerId);
  }

  if (customerId) {
    return filterForCustomer(db, customerId);
  }

  return db;
}
