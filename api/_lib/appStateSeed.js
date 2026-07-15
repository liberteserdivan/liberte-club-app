import { MENU_REVISION, menuCategories, menuItems } from '../../src/lib/menuSeed.js';
import {
  STORE_APP_NAME,
  CLUB_APP_NAME,
  BRAND_SLOGAN,
  LOYALTY_PROMO
} from '../../src/lib/constants.js';

// Production'da varsayılan kasiyer PIN'i asla gömme (BUG-026)
function resolveSeedCashierPin() {
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (!isProd) return '5454';
  const fromEnv = String(process.env.INITIAL_CASHIER_PIN || '').trim();
  if (/^\d{4,8}$/.test(fromEnv) && fromEnv !== '5454') return fromEnv;
  return null;
}

// Boş Supabase projesinde ilk app_state satırı için minimal seed
export function buildInitialAppState() {
  const cashierPin = resolveSeedCashierPin();
  return {
    settings: {
      stamp_threshold: 7,
      reward_description: 'Kategori ikramı',
      cafe_name: STORE_APP_NAME,
      app_name: CLUB_APP_NAME,
      bg: '#f7fbf8',
      card: '#ffffff',
      accent: '#78dfbb',
      font: 'Inter',
      logo: '/liberte-logo-source.png?v=11',
      hero_title: 'Bugünün Favorileri',
      hero_subtitle: BRAND_SLOGAN,
      promo_text: `${BRAND_SLOGAN} ${LOYALTY_PROMO}`,
      ...(cashierPin ? { cashier_pin: cashierPin } : {}),
      review_popup: true,
      daily_popup: true,
      wheel_unlimited: false
    },
    customers: [],
    loyalty: {},
    menuRevision: MENU_REVISION,
    categories: menuCategories,
    items: menuItems,
    notifications: [],
    history: [],
    feedback: [],
    pushSubscriptions: [],
    pushLog: [],
    referrals: [],
    automationLog: [],
    checkIns: [],
    wheelPrizes: [],
    wheelSpins: [],
    dailyCampaigns: [],
    dailyClaims: [],
    coupons: [],
    couponUses: [],
    firstOrderBonuses: [],
    googleReviewRequests: [],
    campaigns: []
  };
}
