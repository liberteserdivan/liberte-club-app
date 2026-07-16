// Normalize tablo cutover — USE_RELATIONAL_STATE=1 ile aktif
export function useRelationalState() {
  return String(process.env.USE_RELATIONAL_STATE || '').trim() === '1';
}

// app_state içinde yalnızca küçük global ayarlar kalmalı
export const GLOBAL_STATE_KEYS = [
  'settings',
  'menuRevision',
  'campaigns',
  'dailyCampaign',
  'dailyCampaigns',
  'wheelPrizes',
  'coupons',
  'couponUses',
  'checkIns',
  'wheelSpins',
  'dailyClaims',
  'firstOrderBonuses',
  'referrals',
  'feedback',
  'googleReviewRequests',
  'customerNotes',
  'notifications',
  'pushSubscriptions',
  'pushLog',
  'automationLog'
];

// Normalize tablolara taşınan ağır alanlar
export const RELATIONAL_STATE_KEYS = [
  'customers',
  'loyalty',
  'categories',
  'items',
  'history'
];
