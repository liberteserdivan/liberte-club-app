import { neon } from "@neondatabase/serverless";

function cleanPhone(v = "") {
  return String(v).replace(/\D/g, "").replace(/^90/, "").replace(/^0/, "");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
    const phone = cleanPhone(body.phone);
    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || "").trim();

    if (!process.env.DATABASE_URL) return res.status(500).json({ error: "DATABASE_URL eksik" });
    if (!email || !code) return res.status(400).json({ error: "Kod veya e-posta eksik" });

    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT * FROM email_codes
      WHERE email=${email}
      AND phone=${phone}
      AND code=${code}
      AND used=false
      AND expires_at > now()
      ORDER BY id DESC
      LIMIT 1
    `;

    if (!rows.length) return res.status(400).json({ error: "Kod geçersiz veya süresi dolmuş" });

    await sql`UPDATE email_codes SET used=true WHERE id=${rows[0].id}`;

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Kod doğrulanamadı" });
  }
}
