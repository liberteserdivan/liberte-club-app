import { buildFirebaseMessagingSw, readFirebaseWebConfig } from './lib/firebaseConfig.js';

// Firebase messaging service worker — runtime config
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const config = readFirebaseWebConfig();
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).send(buildFirebaseMessagingSw(config));
}
