import admin from 'firebase-admin';

function getAdmin(){
  if (admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  let serviceAccount;
  try { serviceAccount = JSON.parse(raw); }
  catch { serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin;
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const {tokens=[], title='Liberte Club', body='Yeni kampanya var!'} = req.body || {};
  const clean=[...new Set(tokens.filter(Boolean))];
  if(!clean.length) return res.status(200).json({ok:true, sent:0, note:'Kayıtlı bildirim tokenı yok.'});
  const fb=getAdmin();
  if(!fb) return res.status(200).json({ok:true, sent:0, note:'FIREBASE_SERVICE_ACCOUNT_JSON yok. Bildirimler uygulama içi kaydedildi; gerçek push için service account ekle.'});
  const result = await fb.messaging().sendEachForMulticast({
    tokens: clean,
    notification: { title, body },
    webpush: { notification: { icon:'/icon.svg', badge:'/icon.svg' }, fcmOptions: { link:'https://app.liberte.cafe' } }
  });
  return res.status(200).json({ok:true, sent:result.successCount, failed:result.failureCount});
}
