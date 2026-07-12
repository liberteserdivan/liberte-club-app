import { apiFetch } from '../lib/apiClient.js';

// Açılışta yalnızca hafif health — login/state fan-out yok
export async function warmApi() {
  try {
    await apiFetch('/api/health', {
      method: 'GET',
      timeoutMs: 4000,
      skipUnauthorized: true,
      omitAuth: true,
      retryTransient: false
    });
  } catch {
    // Sessiz — boot devam eder
  }
}
