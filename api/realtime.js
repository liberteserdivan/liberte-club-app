import { handleRealtimeFetch } from './_lib/handlers/realtimeFetch.js';

export default async function handler(req, res) {
  return handleRealtimeFetch(req, res);
}
