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
    googleReviewRequests: rowsForCustomer(state.googleReviewRequests, customerId),
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

// Müşterinin yalnızca güncelleyebileceği güvenli profil alanları.
// E-POSTA BURADA YOK: e-posta değişimi yalnızca doğrulama kodlu ayrı akışla yapılır;
// /api/state üzerinden e-posta güncellenemez (hesap ele geçirme/doğrulanmamış e-posta riski).
// birthDate yalnızca admin tarafından değiştirilir.
const SAFE_PROFILE_FIELDS = ['name', 'notificationPreferences'];

// Müşteri oturumunun asla yazamayacağı hassas, müşteriye özel satır alanları
const SENSITIVE_ROW_FIELDS = [
  'history',
  'couponUses',
  'dailyClaims',
  'wheelSpins',
  'checkIns',
  'firstOrderBonuses',
  'referrals'
];

// Profil yamasından yalnızca güvenli alanları uygula — isAdmin/role/phone/id korunur
function applySafeProfile(current, patch) {
  const next = { ...current };
  if (typeof patch.name === 'string' && patch.name.trim()) {
    next.name = patch.name.trim();
  }
  // E-posta KASITLI olarak uygulanmaz — yalnızca doğrulamalı e-posta değişim akışı yazabilir
  if ('notificationPreferences' in patch) {
    next.notificationPreferences = patch.notificationPreferences;
  }
  if ('lastVisit' in patch && patch.lastVisit) {
    next.lastVisit = patch.lastVisit;
  }
  return next;
}

// Kullanıcının kendi satırlarını client verisiyle değiştir; diğer üyeler korunur
function replaceOwnRows(canonRows, clientRows, id) {
  const others = (canonRows || []).filter((row) => row.customerId !== id);
  const mine = (clientRows || []).filter((row) => row.customerId === id);
  return [...mine, ...others];
}

// Müşteri yalnızca YENİ bekleyen talep ekleyebilir; mevcut kayıtlar/durumlar korunur
function appendNewPendingRequests(canonRows, clientRows, id) {
  const canon = canonRows || [];
  const hasOpen = canon.some(
    (row) => Number(row.customerId) === Number(id)
      && (row.status === 'pending' || row.status === 'approved')
  );
  if (hasOpen) return canon;

  const existingIds = new Set(canon.map((row) => row.id));
  const additions = (clientRows || [])
    .filter((row) => row.customerId === id && !existingIds.has(row.id))
    .map((row) => ({ ...row, status: 'pending' }));
  return [...additions, ...canon];
}

// Müşteri POST'unda izinsiz alan değişikliği var mı? (403 + loglama için)
export function findCustomerWriteViolations(canonical, clientState, customerId) {
  if (!clientState) return [];
  const id = Number(customerId);
  const canon = canonical || {};
  const violations = [];

  // Sadakat kartı (damga/ikram) değiştirme denemesi
  const canonCard = canon.loyalty?.[id] || canon.loyalty?.[String(id)] || null;
  const clientCard = clientState.loyalty?.[id] || clientState.loyalty?.[String(id)] || null;
  if (clientCard && JSON.stringify(clientCard) !== JSON.stringify(canonCard)) {
    violations.push('loyalty');
  }

  // Kendi kaydında yönetici/rol yükseltme denemesi
  const clientCustomer = (clientState.customers || []).find((c) => Number(c.id) === id);
  if (clientCustomer && (clientCustomer.isAdmin === true || clientCustomer.role)) {
    violations.push('isAdmin');
  }

  // Doğum tarihi — yalnızca admin değiştirebilir
  const canonCustomer = (canon.customers || []).find((c) => Number(c.id) === id);
  if (clientCustomer && canonCustomer && clientCustomer.birthDate !== canonCustomer.birthDate) {
    violations.push('birthDate');
  }

  // E-posta — yalnızca doğrulama kodlu ayrı akışla değişebilir; /api/state ile değişemez
  if (clientCustomer && canonCustomer) {
    const clientEmail = String(clientCustomer.email || '').trim().toLowerCase();
    const canonEmail = String(canonCustomer.email || '').trim().toLowerCase();
    if (clientEmail !== canonEmail) {
      violations.push('email');
    }
  }

  // Hassas müşteriye özel satırları değiştirme denemesi
  for (const field of SENSITIVE_ROW_FIELDS) {
    if (!Array.isArray(clientState[field])) continue;
    const canonRows = rowsForCustomer(canon[field], id);
    const clientRows = rowsForCustomer(clientState[field], id);
    if (JSON.stringify(clientRows) !== JSON.stringify(canonRows)) {
      violations.push(field);
    }
  }

  return violations;
}

// Müşteri yazmalarını yalnızca güvenli profil alanlarıyla sınırla
// loyalty/history/rewards/coupon/wheel/daily vb. client'tan ASLA yazılamaz
export function mergeUserState(canonical, clientState, customerId) {
  const base = { ...(canonical || {}) };
  const id = Number(customerId);

  const patch = (clientState?.customers || []).find((c) => Number(c.id) === id);
  if (patch) {
    base.customers = (base.customers || []).map((c) => (
      Number(c.id) === id ? applySafeProfile(c, patch) : c
    ));
  }

  // Yalnızca güvenli, müşteriye özel listeler güncellenebilir
  base.pushSubscriptions = replaceOwnRows(base.pushSubscriptions, clientState?.pushSubscriptions, id);
  base.feedback = replaceOwnRows(base.feedback, clientState?.feedback, id);

  // Google yorum bonusu: müşteri yalnızca yeni "pending" talep ekleyebilir
  // (damga ancak admin onayıyla verilir); mevcut talepler/durumları korunur
  base.googleReviewRequests = appendNewPendingRequests(
    base.googleReviewRequests,
    clientState?.googleReviewRequests,
    id
  );

  return base;
}

// Admin yazmalarında sunucuya özel gizli ayarları (cashier_pin) koru
export function mergeAdminState(canonical, clientState) {
  const next = { ...(clientState || {}) };
  const canonCustomers = canonical?.customers || [];
  const clientCustomers = clientState?.customers || [];

  // Boş veya kısmi müşteri listesi tüm üyeleri silmesin
  if (clientCustomers.length === 0 && canonCustomers.length > 0) {
    next.customers = canonCustomers;
  } else if (clientCustomers.length > 0 && clientCustomers.length < canonCustomers.length) {
    const patches = new Map(clientCustomers.map((row) => [Number(row.id), row]));
    next.customers = canonCustomers.map((row) => {
      const patch = patches.get(Number(row.id));
      return patch ? { ...row, ...patch } : row;
    });
  }

  const canonSettings = canonical?.settings || {};
  next.settings = {
    ...(clientState?.settings || {}),
    ...(canonSettings.cashier_pin ? { cashier_pin: canonSettings.cashier_pin } : {})
  };
  return next;
}

// Tek tek dışa aktarılan güvenli profil alanı listesi (test/doküman için)
export { SAFE_PROFILE_FIELDS };

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
