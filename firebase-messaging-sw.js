import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(200).json({ data: null, mode: 'local', message: 'DATABASE_URL yok' });
  }

  try {
    const sql = neon(connectionString);
    await sql`CREATE TABLE IF NOT EXISTS app_state (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

    if (req.method === 'GET') {
      const rows = await sql`SELECT data, updated_at FROM app_state WHERE id = 'liberte' LIMIT 1`;
      return res.status(200).json({ data: rows[0]?.data ?? null, updated_at: rows[0]?.updated_at ?? null, mode: 'cloud' });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
      const data = body?.data;
      if (!data) return res.status(400).json({ error: 'data zorunlu' });
      await sql`INSERT INTO app_state (id, data, updated_at)
        VALUES ('liberte', ${JSON.stringify(data)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
      return res.status(200).json({ ok: true, mode: 'cloud' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Database error' });
  }
}
