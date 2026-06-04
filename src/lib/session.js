// Oturum bilgisini güvenli okur
export function readSession() {
  try {
    const raw = localStorage.getItem('liberteSession');
    if (!raw || raw === 'null' || raw === 'undefined') return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.customerId) return null;
    return parsed;
  } catch {
    localStorage.removeItem('liberteSession');
    return null;
  }
}
