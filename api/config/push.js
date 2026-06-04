// Push VAPID anahtarını runtime'da sun — Vercel env yeniden deploy gerektirmez
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const vapidKey = String(
    process.env.FIREBASE_VAPID_PUBLIC_KEY
    || process.env.VITE_FIREBASE_VAPID_KEY
    || ''
  ).trim();

  if (!vapidKey) {
    return res.status(503).json({ error: 'VAPID yapılandırılmadı' });
  }

  return res.status(200).json({ vapidKey });
}
