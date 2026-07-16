// Tarayici yolundan herkese acik sayfa tipini cozer
export function resolveLegalRoute(pathname = '') {
  const path = String(pathname).replace(/\/$/, '') || '/';
  if (path === '/privacy') return 'privacy';
  if (path === '/terms') return 'terms';
  if (path === '/support') return 'support';
  return null;
}

export function isPublicRoute(pathname = '') {
  return Boolean(resolveLegalRoute(pathname));
}