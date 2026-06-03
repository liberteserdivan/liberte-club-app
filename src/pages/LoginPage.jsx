import React,{useState}from'react';
import Brand from '../components/Brand.jsx';
import{findReferrerByCode,loyaltyTemplate,makeReferralCode,norm}from'../lib/db.js';

export default function Login({db,commit,setSession}){
  const[authMode,setAuthMode]=useState('login');
 const[phone,setPhone]=useState(()=>localStorage.getItem('liberteLastPhone')||'');
const[name,setName]=useState('');
const[email,setEmail]=useState(()=>localStorage.getItem('liberteLastEmail')||'');
  const[birthDate,setBirthDate]=useState('');
  const[referralCode,setReferralCode]=useState('');
  const[code,setCode]=useState('');
  const[step,setStep]=useState('form');
  const[loading,setLoading]=useState(false);
  const[info,setInfo]=useState('');
  const[pending,setPending]=useState(null);
  const[notice,setNotice]=useState(null);

  const notify=(message,type='warning')=>setNotice({message,type});
  const valid=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const findByPhone=ph=>(db.customers||[]).find(x=>x.phone===ph);
  const findByEmail=em=>(db.customers||[]).find(x=>String(x.email||'').toLowerCase()===em);

  const fields=()=>{
    const ph=norm(phone);
    const nm=name.trim();
    const em=email.trim().toLowerCase();

    if(ph.length<10){
      notify('Telefon numaranı 10 hane olarak gir.');
      return null;
    }

    if(!valid(em)){
      notify('Geçerli bir e-posta adresi gir.');
      return null;
    }

    if(authMode==='register'&&nm.split(' ').filter(Boolean).length<2){
      notify('Kayıt için isim soyisim zorunlu.');
      return null;
    }

    return{ph,nm,em,birthDate,referralCode:referralCode.trim().toUpperCase().replace(/\s/g,'')};
  };

  function createCustomer(f){
    const next=mergeDb(db);
    const duplicatePhone=(next.customers||[]).some(x=>x.phone===f.ph);
    const duplicateEmail=(next.customers||[]).some(x=>String(x.email||'').toLowerCase()===f.em);
    if(duplicatePhone||duplicateEmail){
      notify('Bu telefon veya e-posta ile zaten kayıt var. Lütfen Giriş Yap ekranını kullan.','info');
      return;
    }

    const referrer=findReferrerByCode(next,f.referralCode);
    const c={
      id:Date.now(),
      phone:f.ph,
      name:f.nm,
      email:f.em,
      isAdmin:f.ph==='5058665406',
      createdAt:new Date().toLocaleString('tr-TR'),
      lastVisit:new Date().toISOString(),
      birthDate:f.birthDate||'',
      referralCode:makeReferralCode(f.nm,f.ph,Date.now()),
      referredBy:referrer?.id||null
    };

    if(f.referralCode&&referrer?.phone===f.ph){
      notify('Kendi referans kodunla kayıt oluşturamazsın.','info');
      return;
    }

    next.customers=[...next.customers,c];
    next.loyalty={...next.loyalty,[c.id]:loyaltyTemplate(c.id)};
    let withBonus=addStampToCustomer(next,c.id,2,'Yeni üye hoş geldin bonusu');

    if(referrer){
      withBonus=addStampToCustomer(withBonus,c.id,2,'Referans kayıt bonusu');
      withBonus=addStampToCustomer(withBonus,referrer.id,2,`${c.name} referans kaydı`);
      withBonus.referrals=[
        {id:Date.now()+15,referrerId:referrer.id,referrerName:referrer.name,newCustomerId:c.id,newCustomerName:c.name,code:getReferralCode(referrer),bonus:2,createdAt:new Date().toLocaleString('tr-TR')},
        ...(withBonus.referrals||[])
      ];
    }

    withBonus.history=[
      {id:Date.now()+3,customerId:c.id,name:c.name,phone:c.phone,type:'register',count:0,source:referrer?`Referanslı kayıt: ${referrer.name}`:'Kullanıcı kayıt',createdAt:new Date().toLocaleString('tr-TR')},
      ...(withBonus.history||[])
    ];

    commit(withBonus);
    setSession({customerId:c.id});
  }

  function loginExisting(customer){
    const createdAt=new Date().toLocaleString('tr-TR');
    commit({
      ...db,
      customers:(db.customers||[]).map(c=>c.id===customer.id?{...c,lastVisit:new Date().toISOString()}:c),
      history:[
        {id:Date.now()+44,customerId:customer.id,name:customer.name,phone:customer.phone,type:'login',count:0,source:'Kullanıcı giriş',createdAt},
        ...(db.history||[])
      ]
    });
   localStorage.setItem('liberteLastPhone',customer.phone||'');
localStorage.setItem('liberteLastEmail',customer.email||'');

setSession({customerId:customer.id});
  }

  async function sendCode(){
    const f=fields();
    if(!f)return;

    const byPhone=findByPhone(f.ph);
    const byEmail=findByEmail(f.em);

    if(authMode==='register'){
      if(byPhone||byEmail){
        notify('Bu telefon veya e-posta ile kayıt var. Lütfen Giriş Yap ekranını kullan.','info');
        return;
      }
    }else{
      if(!byPhone){
        notify('Bu telefon ile kayıt bulunamadı. Önce Kayıt Ol ekranından üye ol.','info');
        return;
      }
      if(String(byPhone.email||'').toLowerCase()!==f.em){
        notify('Telefon ve e-posta eşleşmiyor. Kayıtlı e-posta adresini gir.');
        return;
      }
    }

    setLoading(true);
    setInfo('');

    try{
      const sendName=authMode==='login'?(byPhone?.name||'Liberte Club'):f.nm;
      const r=await fetch('/api/auth/send-code',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          phone:f.ph,
          name:sendName,
          email:f.em
        })
      });

      const text=await r.text();
      const j=text?JSON.parse(text):{};

      if(!r.ok){
        throw new Error(j.error||'Kod gönderilemedi');
      }

      setPending({...f,mode:authMode,customerId:byPhone?.id||null,name:sendName});
      setStep('code');
      setInfo('Kod e-posta adresine gönderildi.');
    }catch(e){
      notify(e.message||'Kod gönderilemedi');
    }finally{
      setLoading(false);
    }
  }

  async function verify(){
    const f=pending||fields();
    if(!f)return;

    if(code.replace(/\D/g,'').length!==6){
      notify('6 haneli doğrulama kodunu gir.');
      return;
    }

    setLoading(true);

    try{
      const r=await fetch('/api/auth/verify-code',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          phone:f.ph,
          email:f.em,
          code
        })
      });

      const text=await r.text();
      const j=text?JSON.parse(text):{};

      if(!r.ok){
        throw new Error(j.error||'Kod doğrulanamadı');
      }

      if(f.mode==='register'){
        createCustomer(f);
      }else{
        const c=(db.customers||[]).find(x=>x.id===f.customerId)||findByPhone(f.ph);
        if(!c)throw new Error('Kullanıcı bulunamadı.');
        loginExisting(c);
      }
    }catch(e){
      notify(e.message||'Kod doğrulanamadı');
    }finally{
      setLoading(false);
    }
  }

  function switchMode(mode){
    setAuthMode(mode);
    setStep('form');
    setCode('');
    setInfo('');
    setPending(null);
  }

  return <section className="loginPage">
    <div className="orb one"></div>
    <div className="orb two"></div>

    <div className="loginCard">
      <Brand db={db}/>

      <h1>{authMode==='login'?'Giriş Yap':'Kayıt Ol'}</h1>
      <p>{authMode==='login'?'Kayıtlı Liberte Club hesabına e-posta kodu ile giriş yap.':'QR sadakat kartı, özel kampanyalar ve Liberte ayrıcalıkları için kayıt ol.'}</p>

      <div className="authSwitch">
        <button type="button" className={authMode==='login'?'active':''} onClick={()=>switchMode('login')}>Giriş Yap</button>
        <button type="button" className={authMode==='register'?'active':''} onClick={()=>switchMode('register')}>Kayıt Ol</button>
      </div>

      {step==='form'?<>
        <label>Telefon</label>
        <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Telefon numaran" inputMode="tel"/>

        {authMode==='register'&&<>
          <label>İsim Soyisim <em>*</em></label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ad Soyad"/>
          <label>Doğum Tarihi</label>
          <input value={birthDate} onChange={e=>setBirthDate(e.target.value)} type="date"/>
          <p className="loginHint mini">Doğum gününde 1 içecek ikramı hesabına tanımlanır.</p>

          <label>Referans Kodu</label>
          <input value={referralCode} onChange={e=>setReferralCode(e.target.value.toUpperCase())} placeholder="Varsa davet kodun"/>
          <p className="loginHint mini">Referans koduyla kayıt olursan sen de davet eden de +2 damga kazanır.</p>
        </>}

        <label>E-posta <em>*</em></label>
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-posta adresin" inputMode="email"/>

        <button disabled={loading} onClick={sendCode}>
          <Mail/> {loading?'Gönderiliyor...':'Mail Kod Gönder'}
        </button>

        {authMode==='login'&&<p className="loginHint">Henüz hesabın yoksa Kayıt Ol sekmesine geç.</p>}
        {authMode==='register'&&<p className="loginHint">Zaten hesabın varsa Giriş Yap sekmesini kullan.</p>}
        {info&&<p className="info">{info}</p>}
      </>:<>
        <label>Mail kodu</label>
        <input value={code} maxLength={6} onChange={e=>setCode(e.target.value)} placeholder="6 haneli kod"/>

        <button disabled={loading} onClick={verify}>
          <ShieldCheck/> {loading?'Kontrol ediliyor...':'Devam Et'}
        </button>

        <button className="ghost" onClick={()=>setStep('form')}>
          Bilgileri değiştir
        </button>

        {info&&<p className="info">{info}</p>}
      </>}
    </div>

    {notice&&<div className="noticeBackdrop" onClick={()=>setNotice(null)}>
      <div className={`noticeModal ${notice.type}`} onClick={e=>e.stopPropagation()}>
        <div className="noticeIcon"><ShieldCheck/></div>
        <h3>{notice.type==='info'?'Bilgilendirme':'Kontrol Edelim'}</h3>
        <p>{notice.message}</p>
        <button onClick={()=>setNotice(null)}>Tamam</button>
      </div>
    </div>}
  </section>;
}
