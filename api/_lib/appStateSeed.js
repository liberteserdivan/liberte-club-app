import { MENU_REVISION, menuCategories, menuItems } from '../../src/lib/menuSeed.js';
import {
  STORE_APP_NAME,
  CLUB_APP_NAME,
  BRAND_SLOGAN,
  LOYALTY_PROMO
} from '../../src/lib/constants.js';

// Boş Supabase projesinde ilk app_state satırı için minimal seed
export function buildInitialAppState() {
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
      cashier_pin: '5454',
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
