// Durum verisini role göre filtrele ve birleştir

const PUBLIC_SETTINGS_KEYS = [
  'cafe_name',
  'app_name',
  'bg',
  'card',
  'accent',
  'font',
  'logo',
  'hero_title',
  'hero_subtitle',
  'promo_text',
  'reward_description',
  'stamp_threshold',
  'review_popup',
  'daily_popup',
  'wheel_unlimited'
];

// Müşteri dizisinden hassas alanları çıkar
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
  return (list || []).filter((row) => row.customerId === customerId);
}

// Kullanıcıya yalnızca kendi verisini döndür
export function filterStateForUser(state, customerId) {
  if (!state) return null;

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
    dailyClaims: rowsForCustomer(state.dailyClaims, customerId),
    wheelSpins: rowsForCustomer(state.wheelSpins, customerId),
    firstOrderBonuses: rowsForCustomer(state.firstOrderBonuses, customerId),
    checkIns: rowsForCustomer(state.checkIns, customerId),
    couponUses: rowsForCustomer(state.couponUses, customerId),
    referrals: (state.referrals || []).filter(
      (row) => row.customerId === customerId || row.referrerId === customerId
    ),
    customerNotes: {},
    pushLog: [],
    automationLog: []
  };
}

// Admin görünümü — tam veri, PIN client'a gönderilmez
export function filterStateForAdmin(state) {
  if (!state) return null;
  const next = { ...state };
  if (next.settings) {
    const { cashier_pin, ...rest } = next.settings;
    next.settings = rest;
  }
  return next;
}

// Kullanıcı yazmalarını güvenli şekilde birleştir
export function mergeUserState(canonical, clientState, customerId) {
  const base = { ...canonical };
  const id = Number(customerId);

  if (clientState.loyalty?.[id] || clientState.loyalty?.[String(id)]) {
    base.loyalty = {
      ...(base.loyalty || {}),
      [id]: clientState.loyalty[id] || clientState.loyalty[String(id)]
    };
  }

  const mergeRows = (key) => {
    const others = (base[key] || []).filter((row) => row.customerId !== id);
    const mine = rowsForCustomer(clientState[key], id);
    base[key] = [...mine, ...others];
  };

  [
    'history',
    'feedback',
    'pushSubscriptions',
    'dailyClaims',
    'wheelSpins',
    'firstOrderBonuses',
    'checkIns',
    'couponUses'
  ].forEach(mergeRows);

  if (clientState.referrals) {
    const others = (base.referrals || []).filter(
      (row) => row.customerId !== id && row.referrerId !== id
    );
    const mine = (clientState.referrals || []).filter(
      (row) => row.customerId === id || row.referrerId === id
    );
    base.referrals = [...mine, ...others];
  }

  const customerPatch = (clientState.customers || []).find((c) => Number(c.id) === id);
  if (customerPatch) {
    const existing = (base.customers || []).find((c) => Number(c.id) === id);
    base.customers = (base.customers || []).map((c) => (
      Number(c.id) === id
        ? {
          ...c,
          name: customerPatch.name || c.name,
          email: customerPatch.email || c.email,
          birthDate: customerPatch.birthDate ?? c.birthDate,
          lastVisit: customerPatch.lastVisit || c.lastVisit
        }
        : c
    ));
    if (!existing) base.customers = [...(base.customers || []), customerPatch];
  }

  return base;
}

// Hesap silme — sunucu tarafı
export function deleteCustomerFromState(state, customerId) {
  const id = Number(customerId);
  const customer = (state.customers || []).find((c) => Number(c.id) === id);
  if (!customer) return state;

  const loyalty = { ...(state.loyalty || {}) };
  delete loyalty[id];
  delete loyalty[String(id)];

  const notes = { ...(state.customerNotes || {}) };
  delete notes[id];
  delete notes[String(id)];

  const withoutRows = (list) => (list || []).filter((row) => row.customerId !== id);

  return {
    ...state,
    customers: (state.customers || []).filter((c) => Number(c.id) !== id),
    loyalty,
    customerNotes: notes,
    referrals: (state.referrals || []).filter(
      (row) => row.customerId !== id && row.referrerId !== id
    ),
    history: withoutRows(state.history),
    feedback: withoutRows(state.feedback),
    pushSubscriptions: withoutRows(state.pushSubscriptions),
    dailyClaims: withoutRows(state.dailyClaims),
    wheelSpins: withoutRows(state.wheelSpins),
    firstOrderBonuses: withoutRows(state.firstOrderBonuses),
    checkIns: withoutRows(state.checkIns),
    couponUses: withoutRows(state.couponUses)
  };
}
