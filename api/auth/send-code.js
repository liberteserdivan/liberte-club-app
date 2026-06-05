import { neon } from '@neondatabase/serverless';
import { cleanPhone } from '../lib/phone.js';

function validEmail(v=''){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).toLowerCase())}
function makeCode(){return String(Math.floor(100000 + Math.random()*900000))}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body;
    const purpose = body.purpose === 'login' ? 'login' : 'register';
    const phone = cleanPhone(body.phone);
    let name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    if (phone.length < 10) return res.status(400).json({ error: 'Telefon eksik' });
    if (purpose === 'login') {
      return res.status(400).json({ error: 'Giriş artık yalnızca telefon ile yapılır. Kayıt için kod isteyin.' });
    }
    if (!validEmail(email)) return res.status(400).json({ error: 'Geçerli e-posta zorunlu' });
    if (name.split(' ').filter(Boolean).length < 2) return res.status(400).json({ error: 'İsim soyisim zorunlu' });
    if(!name) name='Liberte Üye';
    if(!process.env.DATABASE_URL) return res.status(500).json({error:'DATABASE_URL eksik'});
    const sql=neon(process.env.DATABASE_URL);
    await sql`CREATE TABLE IF NOT EXISTS email_codes (id bigserial PRIMARY KEY,email text NOT NULL,phone text NOT NULL,code text NOT NULL,attempts int NOT NULL DEFAULT 0,used boolean NOT NULL DEFAULT false,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`;
    const code=makeCode();
    // Önce yeni kodu kaydet, sonra eskileri geçersiz kıl
    await sql`INSERT INTO email_codes (email, phone, code, expires_at) VALUES (${email}, ${phone}, ${code}, now() + interval '10 minutes')`;
    await sql`UPDATE email_codes SET used=true WHERE email=${email} AND phone=${phone} AND code<>${code} AND used=false`;
    const apiKey=process.env.RESEND_API_KEY;
    const from=process.env.RESEND_FROM_EMAIL || 'Liberte Club <noreply@liberte.cafe>';
    const subject = 'Liberte Club kayıt kodun';
    const html = `<div style="font-family:Arial,sans-serif;background:#06110d;color:#fff;padding:28px;border-radius:18px"><h2 style="color:#b9f5d0">Liberte Club</h2><p>Merhaba ${name},</p><p>Kayıt doğrulama kodun:</p><div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#b9f5d0;margin:18px 0">${code}</div><p>Bu kod 10 dakika geçerlidir.</p><p style="opacity:.7;font-size:13px">Bu işlemi sen yapmadıysan bu maili yok sayabilirsin.</p></div>`;
    if(apiKey){
      const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:email,subject,html})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok) return res.status(500).json({error:j.message||'Resend e-posta gönderemedi'});
      return res.status(200).json({ok:true,phone,email});
    }
    return res.status(200).json({ok:true,testCode:code,phone,email,warning:'RESEND_API_KEY yok, test kodu ekranda gösterildi.'});
  }catch(e){return res.status(500).json({error:e.message||'Kod gönderilemedi'});}
}
