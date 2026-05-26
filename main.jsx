import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (!process.env.DATABASE_URL) return res.status(500).json({ error: "DATABASE_URL eksik" });
    const sql = neon(process.env.DATABASE_URL);

    await sql`CREATE TABLE IF NOT EXISTS app_state (
      id int PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

    if (req.method === "GET") {
      const rows = await sql`SELECT data FROM app_state WHERE id=1`;
      return res.status(200).json({ ok: true, data: rows[0]?.data || null });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
      await sql`
        INSERT INTO app_state (id, data, updated_at)
        VALUES (1, ${JSON.stringify(body.data || {})}::jsonb, now())
        ON CONFLICT (id)
        DO UPDATE SET data=EXCLUDED.data, updated_at=now()
      `;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "State error" });
  }
}
