// Push bildirimi hedef kitle filtreleme
import { levelByLp, migrateLoyaltyCard } from './loyaltyPoints.js';

const MS_DAY = 24 * 60 * 60 * 1000;
const VISIT_WINDOW_DAYS = 30;

// Aktif token kaydı mı
export function isActivePushSubscription(row) {
  return Boolean(row?.token) && row.active !== false;
}

// İzin verilmiş aktif token mı
export function isGrantedPushSubscription(row) {
  if (!isActivePushSubscription(row)) return false;
  const status = String(row.permissionStatus || row.permission_status || 'granted').toLowerCase();
  return status === 'granted' || status === 'unknown';
}

// Hedef kitle tanımları
export const PUSH_AUDIENCE_OPTIONS = [
  { id: 'all', label: 'Tüm kullanıcılar' },
  { id: 'granted_devices', label: 'Sadece izin vermiş cihazlar' },
  { id: 'bronze', label: 'Bronze üyeler' },
  { id: 'silver', label: 'Silver üyeler' },
  { id: 'gold', label: 'Gold üyeler' },
  { id: 'black', label: 'Black üyeler' },
  { id: 'visited_30d', label: 'Son 30 günde gelenler' },
  { id: 'inactive_30d', label: 'Son 30 günde gelmeyenler' },
  { id: 'lp_gte_7', label: "LP'si 7 ve üzeri olanlar" },
  { id: 'lp_gte_15', label: "LP'si 15 ve üzeri olanlar" },
  { id: 'lp_gte_25', label: "LP'si 25 ve üzeri olanlar" },
  { id: 'birthday_month', label: 'Doğum günü bu ay olanlar' }
];

// Tarih metnini Date'e çevir — ISO ve tr-TR locale
function parseActivityDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  const trMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (trMatch) {
    const day = Number(trMatch[1]);
    const month = Number(trMatch[2]);
    const year = Number(trMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const iso = Date.parse(text);
  if (!Number.isNaN(iso)) return new Date(iso);

  return null;
}

// Müşterinin son ziyaret / işlem tarihi
export function getCustomerLastActivityAt(customer, history = [], checkIns = []) {
  const dates = [];

  const fromLastVisit = parseActivityDate(customer?.lastVisit);
  if (fromLastVisit) dates.push(fromLastVisit.getTime());

  (history || []).forEach((row) => {
    if (Number(row.customerId) !== Number(customer?.id)) return;
    const relevant = [
      'check_in', 'earn_coffee', 'earn_dessert', 'earn_sandwich', 'earn_burger',
      'lp_add', 'stamp_add', 'login', 'register'
    ];
    if (!relevant.includes(row.type)) return;
    const parsed = parseActivityDate(row.createdAt);
    if (parsed) dates.push(parsed.getTime());
  });

  (checkIns || []).forEach((row) => {
    if (Number(row.customerId) !== Number(customer?.id)) return;
    const parsed = parseActivityDate(row.createdAt || row.date);
    if (parsed) dates.push(parsed.getTime());
  });

  if (!dates.length) return null;
  return new Date(Math.max(...dates));
}

// Son 30 gün içinde aktif mi
export function isActiveWithinDays(customer, history, checkIns, days = VISIT_WINDOW_DAYS) {
  const last = getCustomerLastActivityAt(customer, history, checkIns);
  if (!last) return false;
  return Date.now() - last.getTime() <= days * MS_DAY;
}

// Doğum günü bu ay mı
export function isBirthdayThisMonth(birthDate, date = new Date()) {
  if (!birthDate) return false;
  const parts = String(birthDate).split('-');
  if (parts.length < 2) return false;
  return Number(parts[1]) === date.getMonth() + 1;
}

// Veride doğum tarihi var mı — hedef seçeneği için
export function hasAnyBirthDate(customers = []) {
  return (customers || []).some((row) => Boolean(row?.birthDate));
}

// Müşteri seviyesini toplam LP'den oku
function customerLevel(customer, loyalty = {}) {
  const card = migrateLoyaltyCard(loyalty[customer.id] || loyalty[String(customer.id)]);
  return card?.level || levelByLp(card?.lpLifetime || 0);
}

// Müşteri mevcut LP bakiyesi
function customerLpBalance(customer, loyalty = {}) {
  const card = migrateLoyaltyCard(loyalty[customer.id] || loyalty[String(customer.id)]);
  return card?.lpBalance || 0;
}

// Hedef kitle seçeneği kullanılabilir mi
export function getAudienceOptionState(db, audienceId) {
  if (audienceId !== 'birthday_month') {
    return { disabled: false, reason: '' };
  }

  if (!hasAnyBirthDate(db.customers || [])) {
    return {
      disabled: true,
      reason: 'Doğum tarihi alanı gerekli — en az bir üyede birthDate tanımlı olmalı.'
    };
  }

  return { disabled: false, reason: '' };
}

// Müşteri hedef kitleye uyuyor mu
export function customerMatchesAudience(customer, audienceId, db) {
  const loyalty = db.loyalty || {};
  const history = db.history || [];
  const checkIns = db.checkIns || [];
  const level = customerLevel(customer, loyalty);
  const lpBalance = customerLpBalance(customer, loyalty);
  const card = migrateLoyaltyCard(loyalty[customer.id] || loyalty[String(customer.id)]);
  const lifetime = card?.lpLifetime || 0;

  switch (audienceId) {
    case 'all':
      return true;
    case 'granted_devices':
      return true;
    case 'bronze':
      return level === 'Bronze' || lifetime < 50;
    case 'silver':
      return level === 'Silver' || (lifetime >= 50 && lifetime < 150);
    case 'gold':
      return level === 'Gold' || (lifetime >= 150 && lifetime < 300);
    case 'black':
      return level === 'Black' || lifetime >= 300;
    case 'visited_30d':
      return isActiveWithinDays(customer, history, checkIns);
    case 'inactive_30d':
      return !isActiveWithinDays(customer, history, checkIns);
    case 'lp_gte_7':
      return lpBalance >= 7;
    case 'lp_gte_15':
      return lpBalance >= 15;
    case 'lp_gte_25':
      return lpBalance >= 25;
    case 'birthday_month':
      return isBirthdayThisMonth(customer.birthDate);
    default:
      return false;
  }
}

// Bildirim kanalı — platform ios/android ise native kabul et
export function resolvePushChannel(row) {
  if (row?.channel === 'native' || row?.channel === 'web') return row.channel;
  if (row?.platform === 'ios' || row?.platform === 'android') return 'native';
  if (row?.platform === 'web') return 'web';
  return 'web';
}

// Üye başına native token varsa yalnızca ona gönder — Safari web tokenını atla
export function selectDeliverySubscriptions(subscriptions = []) {
  const activeRows = subscriptions.filter(isActivePushSubscription);
  const byCustomer = new Map();

  activeRows.forEach((row) => {
    const customerId = Number(row.customerId);
    if (!byCustomer.has(customerId)) byCustomer.set(customerId, []);
    byCustomer.get(customerId).push(row);
  });

  const selected = [];
  for (const rows of byCustomer.values()) {
    const nativeRows = rows.filter((row) => resolvePushChannel(row) === 'native');
    selected.push(...(nativeRows.length ? nativeRows : rows));
  }

  return selected;
}

// Hedef kitleye göre abonelikleri çöz
export function resolvePushAudience(db, audienceId = 'all') {
  const option = PUSH_AUDIENCE_OPTIONS.find((row) => row.id === audienceId) || PUSH_AUDIENCE_OPTIONS[0];
  const optionState = getAudienceOptionState(db, audienceId);

  if (optionState.disabled) {
    return {
      audienceId,
      audienceLabel: option.label,
      disabled: true,
      disabledReason: optionState.reason,
      subscriptions: [],
      tokens: [],
      targetUserCount: 0,
      targetCustomerIds: [],
      deviceCount: 0
    };
  }

  const customers = db.customers || [];
  const matchedIds = new Set(
    customers
      .filter((customer) => customerMatchesAudience(customer, audienceId, db))
      .map((customer) => Number(customer.id))
  );

  const matchedSubscriptions = (db.pushSubscriptions || []).filter((row) => {
    if (!isGrantedPushSubscription(row)) return false;
    if (audienceId === 'granted_devices') return true;
    return matchedIds.has(Number(row.customerId));
  });

  const subscriptions = selectDeliverySubscriptions(matchedSubscriptions);
  const tokens = [...new Set(subscriptions.map((row) => row.token).filter(Boolean))];
  const targetIds = audienceId === 'granted_devices'
    ? new Set(subscriptions.map((row) => Number(row.customerId)))
    : matchedIds;

  return {
    audienceId,
    audienceLabel: option.label,
    disabled: false,
    disabledReason: '',
    subscriptions,
    tokens,
    targetUserCount: targetIds.size,
    targetCustomerIds: [...targetIds],
    deviceCount: tokens.length
  };
}
