// Liberte Guardian — API giriş noktası
// Tek sorumluluk: guardian handler'ını SQL istek sarmalayıcısıyla servis etmek.
// Handler ihtiyaç anında yüklenir (soğuk başlatmada ağır modüller atlanır).
import { withSqlRequestNoGuardian } from './_lib/sqlRequest.js';
import { applyCors } from './_lib/http.js';

// Guardian hydrate yok — health handler zaten kendi DB okumasını yapar
export default withSqlRequestNoGuardian(async function handler(req, res) {
  // Kimlik doğrulamalı (cookie/Bearer) istekler için origin'e özgü CORS
  applyCors(req, res, 'GET,POST,OPTIONS');
  const { handleGuardian } = await import('./_lib/handlers/guardian.js');
  return handleGuardian(req, res);
});
