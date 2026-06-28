import { SERVICE } from './guardianConstants.js';

// Liberte Guardian — URL/endpoint → servis eşlemesi
// Tek sorumluluk: bir API isteğini Guardian servis kategorisine sınıflandırmak.
// Böylece metrikler servis bazında (db/auth/qr/loyalty/...) gruplanabilir.

// İstek URL'i ve query'sinden Guardian servis adını çıkar
export function serviceForUrl(url, query = {}) {
  const path = String(url || '').split('?')[0].toLowerCase();
  const resource = String(query?.resource || '').toLowerCase();

  if (path.includes('/api/auth')) {
    // login alt-akışını ayrı izle (yavaşlık kuralı login bazlı)
    if (path.includes('login') || resource.includes('login')) return SERVICE.LOGIN;
    return SERVICE.AUTH;
  }
  if (path.includes('/api/qr')) return SERVICE.QR;
  if (path.includes('/api/loyalty')) return SERVICE.LOYALTY;
  if (path.includes('/api/realtime')) return SERVICE.REALTIME;
  if (path.includes('/api/push')) return SERVICE.PUSH;
  if (path.includes('/api/config')) return SERVICE.CONFIG;
  // admin loyalty-action da LP sayılır
  if (path.includes('/api/admin') && resource.includes('loyalty')) return SERVICE.LOYALTY;
  return SERVICE.API;
}
