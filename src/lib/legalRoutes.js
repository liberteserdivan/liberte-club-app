// Tarayici yolundan herkese acik yasal sayfa tipini cozer
export function resolveLegalRoute(pathname = '') {
  const path = String(pathname).replace(/\/$/, '') || '/';
  if (path === '/privacy') return 'privacy';
  if (path === '/terms') return 'terms';
  return null;
}
