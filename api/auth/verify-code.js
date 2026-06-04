import { neon } from '@neondatabase/serverless';
function cleanPhone(v=''){return String(v).replace(/\D/g,'').replace(/^90/,'').replace(/^0/,'')}
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body;
    const phone=cleanPhone(body.phone); const email=String(body.email||'').trim().toLowerCase(); const code=String(body.code||'').replace(/\D/g,'');
    if(!process.env.DATABASE_URL) return res.status(500).json({error:'DATABASE_URL eksik'});
    if(!email || phone.length<10 || code.length!==6) return res.status(400).json({error:'Bilgiler eksik'});
    const sql=neon(process.env.DATABASE_URL);
    await sql`CREATE TABLE IF NOT EXISTS email_codes (
      id bigserial PRIMARY KEY,
      email text NOT NULL,
      phone text NOT NULL,
      code text NOT NULL,
      attempts int NOT NULL DEFAULT 0,
      used boolean NOT NULL DEFAULT false,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    const rows=await sql`SELECT id, code, attempts, expires_at, used FROM email_codes WHERE email=${email} AND phone=${phone} AND used=false ORDER BY created_at DESC LIMIT 1`;
    const row=rows[0];
    if(!row) return res.status(400).json({error:'Aktif kod bulunamadı. Yeni kod iste.'});
    if(new Date(row.expires_at).getTime()<Date.now()) return res.status(400).json({error:'Kod süresi doldu. Yeni kod iste.'});
    if(row.attempts>=5) return res.status(429).json({error:'Çok fazla deneme. Yeni kod iste.'});
    const storedCode=String(row.code||'').replace(/\D/g,'');
    if(storedCode!==code){
      await sql`UPDATE email_codes SET attempts=attempts+1 WHERE id=${row.id}`;
      return res.status(400).json({error:'Kod hatalı. En son gelen kodu gir veya yeni kod iste.'});
    }
    await sql`UPDATE email_codes SET used=true WHERE id=${row.id}`;
    return res.status(200).json({ok:true});
  }catch(e){return res.status(500).json({error:e.message||'Kod doğrulanamadı'});}
}
