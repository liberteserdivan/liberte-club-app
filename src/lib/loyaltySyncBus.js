const LOYALTY_REFRESH_EVENT = 'liberte:loyalty-refresh';

// Kasada LP sonrası veya uygulama ön plana gelince anında loyalty çekimi
export function requestLoyaltyRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LOYALTY_REFRESH_EVENT));
}

// Loyalty poll hook aboneliği
export function subscribeLoyaltyRefresh(handler) {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener(LOYALTY_REFRESH_EVENT, handler);
  return () => window.removeEventListener(LOYALTY_REFRESH_EVENT, handler);
}
