import { handleRealtimeFetch } from './_lib/handlers/realtimeFetch.js';
import { withSqlRequestNoGuardian } from './_lib/sqlRequest.js';

// Realtime fetch — Guardian hydrate yok (oturum/DB okuma hızlı kalmalı)
export default withSqlRequestNoGuardian(async function handler(req, res) {
  return handleRealtimeFetch(req, res);
});
