import { handleRealtimeFetch } from './_lib/handlers/realtimeFetch.js';
import { withSqlRequest } from './_lib/sqlRequest.js';

export default withSqlRequest(async function handler(req, res) {
  return handleRealtimeFetch(req, res);
});
