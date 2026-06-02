import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{QRCodeCanvas}from'qrcode.react';
import{Html5Qrcode}from'html5-qrcode';
import{initializeApp}from'firebase/app';
import{getMessaging,getToken,isSupported,onMessage}from'firebase/messaging';
import{Bell,Coffee,Crown,Gift,Home,Image as ImageIcon,Instagram,LogOut,Mail,MapPin,Menu as MenuIcon,Minus,Plus,QrCode,ScanLine,Send,ShieldCheck,ShoppingBag,Sparkles,Star,Trash2,UploadCloud}from'lucide-react';
import'./style.css';

const firebaseConfig={apiKey:'AIzaSyCDWpSpPoEsMirO0Grbpbabaju7QALVERC',authDomain:'liberte-club.firebaseapp.com',projectId:'liberte-club',storageBucket:'liberte-club.firebasestorage.app',messagingSenderId:'605225271131',appId:'1:605225271131:web:d03f217cfd9445a193e47e',measurementId:'G-HRKRV78XGS'};

const googleReviewUrl='https://g.page/r/CY8uWX2mwBgIEBM/review';
const instagramUrl='https://www.instagram.com/gastroliberte';
const yemeksepetiUrl='https://www.yemeksepeti.com/restaurant/x9yt/liberte-gastro-cafe';
const mapsUrl='https://www.google.com/maps/search/?api=1&query=Liberte+Gastro+Cafe+Serdivan+Sakarya';

const seed={
  settings:{
    stamp_threshold:10,
    reward_description:'1 Bedava İçecek',
    cafe_name:'Liberte Gastro Cafe',
    app_name:'Liberte Club',
    bg:'#f7fbf8',
    card:'#ffffff',
    accent:'#78dfbb',
    font:'Inter',
    logo:'',
    hero_title:'Bugünün Favorileri',
    hero_subtitle:'Kahve, tatlı ve burger keyfi Liberte’de.',
    promo_text:'QR kartını göster, 10 damgada 1 içecek bizden.',
    cashier_pin:'5454',
    review_popup:true,
    daily_popup:true
  },
  customers:[
    {
      id:1,
      phone:'5058665406',
      name:'Liberte Gastro',
      email:'liberteserdivan@gmail.com',
      isAdmin:true,
      createdAt:new Date().toLocaleString('tr-TR'),
      lastVisit:null,
      birthDate:''
    }
  ],
  loyalty:{
    1:{
      customerId:1,
      totalStamps:0,
      availableRewards:0,
      usedRewards:0,
      lifetimeStamps:0,
      level:'Bronze'
    }
  },
  categories:[
    {id:1,name:'Kahveler',description:'Sıcak ve soğuk kahveler',icon:'☕'},
    {id:2,name:'Tatlılar',description:'Magnolia, waffle ve cheesecake',icon:'🍰'},
    {id:3,name:'Burger',description:'Smash burger ve atıştırmalıklar',icon:'🍔'},
    {id:4,name:'Soğuk İçecek',description:'Milkshake ve ferah içecekler',icon:'🥤'}
  ],
  items:[
    {id:1,categoryId:1,name:'Latte',description:'Espresso ve süt dengesi',price:90,featured:true,best:true,image:'☕',tone:'#b69474',imageUrl:''},
    {id:2,categoryId:1,name:'Ice Americano',description:'Buzlu ferah americano',price:80,featured:true,image:'🧊',tone:'#4b8aa8',imageUrl:''},
    {id:3,categoryId:2,name:'Çilekli Magnolia',description:'Çilek, krema ve bisküvi katları',price:145,featured:true,best:true,image:'🍓',tone:'#d85f71',imageUrl:''},
    {id:4,categoryId:2,name:'San Sebastian',description:'Kremamsı cheesecake',price:170,featured:true,image:'🍰',tone:'#d6ad70',imageUrl:''},
    {id:5,categoryId:3,name:'Smash Burger',description:'140 g et, cheddar ve özel sos',price:295,featured:true,best:true,image:'🍔',tone:'#a0482d',imageUrl:''},
    {id:6,categoryId:4,name:'Milkshake',description:'Yoğun kıvamlı soğuk lezzet',price:140,featured:true,image:'🥤',tone:'#bb7fb2',imageUrl:''}
  ],
  notifications:[
    {id:1,title:'Liberte Club Açıldı',body:'QR kartını göster, damgalarını toplamaya başla.',createdAt:new Date().toLocaleString('tr-TR')}
  ],
  history:[],
  feedback:[],
  pushSubscriptions:[],
  campaigns:[
    {id:1,title:'Bugüne Özel',body:'Smash Menü + kahve fırsatını kaçırma.',active:true,emoji:'🔥'}
  ]
};

function mergeDb(x){
  return x?{
    ...seed,
    ...x,
    settings:{...seed.settings,...x.settings},
    customers:x.customers||seed.customers,
    loyalty:x.loyalty||seed.loyalty,
    categories:x.categories||seed.categories,
    items:x.items||seed.items,
    notifications:x.notifications||seed.notifications,
    history:x.history||[],
    feedback:x.feedback||[],
    pushSubscriptions:x.pushSubscriptions||[],
    campaigns:x.campaigns||seed.campaigns
  }:seed;
}

function load(){
  try{
    return mergeDb(JSON.parse(localStorage.getItem('liberteDB')||'null'));
  }catch{
    return seed;
  }
}

function save(db){
  localStorage.setItem('liberteDB',JSON.stringify(db));
}

async function loadRemote(){
  try{
    const r=await fetch('/api/state');
    if(!r.ok)return null;
    const j=await r.json();
    return j?.data?mergeDb(j.data):null;
  }catch{
    return null;
  }
}

async function saveRemote(db){
  try{
    await fetch('/api/state',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({data:db})
    });
  }catch{}
}

const norm=p=>String(p||'').replace(/\D/g,'').replace(/^90/,'').replace(/^0/,'');
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(n||0));
const cssVars=s=>({'--bg':s.bg,'--card':s.card,'--accent':s.accent,fontFamily:`${s.font},Inter,system-ui,Arial`});
const levelByStamps=n=>n>=90?'Black':n>=50?'Gold':n>=20?'Silver':'Bronze';
const todayKey=()=>new Date().toISOString().slice(0,10);
const birthdayKey=()=>{
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
function getGreeting(){
  const d=new Date();
  const h=d.getHours();
  const time=d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
  if(h>=5&&h<12)return{label:'Günaydın',emoji:'☀️',time,tone:'Sabah kahvesi zamanı'};
  if(h>=12&&h<17)return{label:'İyi günler',emoji:'☕',time,tone:'Günün en güzel molası'};
  if(h>=17&&h<22)return{label:'İyi akşamlar',emoji:'🌙',time,tone:'Akşam keyfi Liberte’de'};
  return{label:'İyi geceler',emoji:'✨',time,tone:'Geceye tatlı bir mola'};
}
function isBirthdayToday(birthDate){
  if(!birthDate)return false;
  const parts=String(birthDate).split('-');
  if(parts.length<3)return false;
  const d=new Date();
  return Number(parts[1])===d.getMonth()+1&&Number(parts[2])===d.getDate();
}


function productImageSrc(item){
  const direct=String(item?.imageUrl||'').trim();
  if(direct)return direct;
  const img=String(item?.image||'').trim();
  if(/^https?:\/\//i.test(img)||img.startsWith('data:image/'))return img;
  return '';
}

function fileToDataUrl(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=rej;
    r.readAsDataURL(file);
  });
}

function loyaltyTemplate(id){
  return{
    customerId:id,
    totalStamps:0,
    availableRewards:0,
    usedRewards:0,
    lifetimeStamps:0,
    level:'Bronze'
  };
}

function addStampToCustomer(db,id,count=1,source='Admin'){
  const customer=db.customers.find(c=>c.id===id);
  if(!customer)return db;

  const current=db.loyalty[id]||loyaltyTemplate(id);
  const threshold=db.settings.stamp_threshold||10;
  const oldTotal=current.totalStamps||0;
  const oldRewards=current.availableRewards||0;
  const oldLifetime=current.lifetimeStamps||0;

  let total=Math.max(0,oldTotal+count);
  let rewards=oldRewards;

  while(total>=threshold){
    total-=threshold;
    rewards+=1;
  }

  const lifetime=Math.max(0,oldLifetime+Math.max(count,0));
  const createdAt=new Date().toLocaleString('tr-TR');

  return{
    ...db,
    loyalty:{
      ...db.loyalty,
      [id]:{
        ...current,
        totalStamps:total,
        availableRewards:rewards,
        lifetimeStamps:lifetime,
        level:levelByStamps(lifetime),
        updatedAt:createdAt
      }
    },
    history:[
      {
        id:Date.now(),
        customerId:id,
        name:customer.name,
        phone:customer.phone,
        type:count>=0?'stamp_add':'stamp_remove',
        count,
        before:{totalStamps:oldTotal,availableRewards:oldRewards,lifetimeStamps:oldLifetime},
        after:{totalStamps:total,availableRewards:rewards,lifetimeStamps:lifetime},
        source,
        createdAt
      },
      ...(db.history||[])
    ]
  };
}

function redeemRewardForCustomer(db,id,source='Admin'){
  const customer=db.customers.find(c=>c.id===id);
  if(!customer)return db;

  const current=db.loyalty[id]||loyaltyTemplate(id);
  const rewards=current.availableRewards||0;

  if(rewards<=0){
    alert('Bu müşterinin kullanılabilir ikram hakkı yok.');
    return db;
  }

  const createdAt=new Date().toLocaleString('tr-TR');
  const next={
    ...current,
    availableRewards:rewards-1,
    usedRewards:(current.usedRewards||0)+1,
    updatedAt:createdAt
  };

  return{
    ...db,
    loyalty:{
      ...db.loyalty,
      [id]:next
    },
    history:[
      {
        id:Date.now(),
        customerId:id,
        name:customer.name,
        phone:customer.phone,
        type:'reward_redeem',
        count:1,
        reward:db.settings.reward_description||'1 Bedava İçecek',
        before:{availableRewards:rewards,usedRewards:current.usedRewards||0},
        after:{availableRewards:next.availableRewards,usedRewards:next.usedRewards},
        source,
        createdAt
      },
      ...(db.history||[])
    ]
  };
}

function applyBirthdayReward(db,id){
  const customer=db.customers.find(c=>c.id===id);
  if(!customer||!isBirthdayToday(customer.birthDate))return db;

  const year=new Date().getFullYear();
  const already=(db.history||[]).some(h=>h.customerId===id&&h.type==='birthday_reward'&&h.year===year);
  if(already)return db;

  const current=db.loyalty[id]||loyaltyTemplate(id);
  const createdAt=new Date().toLocaleString('tr-TR');

  return{
    ...db,
    loyalty:{
      ...db.loyalty,
      [id]:{
        ...current,
        availableRewards:(current.availableRewards||0)+1,
        updatedAt:createdAt
      }
    },
    history:[
      {
        id:Date.now()+91,
        customerId:id,
        name:customer.name,
        phone:customer.phone,
        type:'birthday_reward',
        count:1,
        reward:'Doğum günü ikramı',
        source:'Doğum günü otomatik hediye',
        year,
        createdAt
      },
      ...(db.history||[])
    ]
  };
}

function useCommit(initial){
  const[db,setDb]=useState(initial);
  const[mode,setMode]=useState('local');

  useEffect(()=>{
    loadRemote().then(r=>{
      if(r){
        setDb(r);
        save(r);
        setMode('cloud');
      }
    });
  },[]);

  const commit=n=>{
    setDb(n);
    save(n);
    saveRemote(n);
    setMode('cloud');
  };

  return[db,commit,mode];
}

function Brand({db,small=false}){
  return db.settings.logo
    ? <img className={small?'brandLogo small':'brandLogo'} src={db.settings.logo}/>
    : <div className={small?'logo small':'logo'}><b>L</b><span>Liberte</span></div>;
}

function App(){
  const[db,commit,sync]=useCommit(load());
  const[session,setSession]=useState(()=>JSON.parse(localStorage.getItem('liberteSession')||'null'));
  const[tab,setTab]=useState('home');

  useEffect(()=>{
    if(session)localStorage.setItem('liberteSession',JSON.stringify(session));
    else localStorage.removeItem('liberteSession');
  },[session]);

  useEffect(()=>{
    const refreshMs=5*60*1000;
    const t=setTimeout(()=>window.location.reload(),refreshMs);
    return()=>clearTimeout(t);
  },[]);

  const customer=session?(db.customers.find(c=>c.id===session.customerId)||db.customers[0]):null;

  useEffect(()=>{
    if(!customer?.id)return;
    const next=applyBirthdayReward(db,customer.id);
    if(next!==db)commit(next);
  },[customer?.id,customer?.birthDate]);

  if(!session){
    return <main style={cssVars(db.settings)}>
      <Login db={db} commit={commit} setSession={setSession}/>
    </main>;
  }

  const card=db.loyalty[customer.id]||{};

  return <main className="app" style={cssVars(db.settings)}>
    {tab==='home'&&<Header db={db} customer={customer} setSession={setSession} sync={sync}/>}
    {tab==='home'&&<HomeScreen db={db} customer={customer} card={card} commit={commit} setTab={setTab}/>}
    {tab==='menu'&&<MenuScreen db={db}/>}
    {tab==='qr'&&<QrScreen db={db} customer={customer} card={card}/>}
    {tab==='campaign'&&<CampaignScreen db={db} customer={customer} commit={commit}/>}
    {tab==='admin'&&customer.isAdmin&&<AdminScreen db={db} commit={commit}/>}

    <Nav tab={tab} setTab={setTab} admin={customer.isAdmin}/>
  </main>;
}

function Login({db,commit,setSession}){
  const[authMode,setAuthMode]=useState('login');
  const[phone,setPhone]=useState('');
  const[name,setName]=useState('');
  const[email,setEmail]=useState('');
  const[birthDate,setBirthDate]=useState('');
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

    return{ph,nm,em,birthDate};
  };

  function createCustomer(f){
    const next=mergeDb(db);
    const duplicatePhone=(next.customers||[]).some(x=>x.phone===f.ph);
    const duplicateEmail=(next.customers||[]).some(x=>String(x.email||'').toLowerCase()===f.em);
    if(duplicatePhone||duplicateEmail){
      notify('Bu telefon veya e-posta ile zaten kayıt var. Lütfen Giriş Yap ekranını kullan.','info');
      return;
    }

    const c={
      id:Date.now(),
      phone:f.ph,
      name:f.nm,
      email:f.em,
      isAdmin:f.ph==='5058665406',
      createdAt:new Date().toLocaleString('tr-TR'),
      lastVisit:null,
      birthDate:f.birthDate||''
    };

    next.customers=[...next.customers,c];
    next.loyalty={...next.loyalty,[c.id]:loyaltyTemplate(c.id)};
    const withBonus=addStampToCustomer(next,c.id,2,'Yeni üye hoş geldin bonusu');
    withBonus.history=[
      {id:Date.now()+2,customerId:c.id,name:c.name,phone:c.phone,type:'welcome_bonus',count:2,source:'Yeni üyelik hediyesi',createdAt:new Date().toLocaleString('tr-TR')},
      {id:Date.now()+1,customerId:c.id,name:c.name,phone:c.phone,type:'register',count:0,source:'Kullanıcı kayıt',createdAt:new Date().toLocaleString('tr-TR')},
      ...(withBonus.history||[])
    ];

    commit(withBonus);
    setSession({customerId:c.id});
  }

  function loginExisting(customer){
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

function Header({db,customer,setSession,sync}){
  return <header>
    <div className="head">
      <Brand db={db} small/>
      <div>
        <b>{db.settings.app_name}</b>
        <span>{customer.name} · {sync==='cloud'?'Bulut kayıt':'Yerel kayıt'}</span>
      </div>
    </div>

    <button className="logout" onClick={()=>setSession(null)}>
      <LogOut/><span>Çıkış</span>
    </button>
  </header>;
}

function Nav({tab,setTab,admin}){
  const arr=[
    ['home',Home,'Ana Sayfa'],
    ['menu',MenuIcon,'Menü'],
    ['qr',QrCode,'QR'],
    ['campaign',Gift,'Fırsat']
  ];

  if(admin)arr.push(['admin',ShieldCheck,'Admin']);

  return <nav className="liberteNav">
    {arr.map(([id,Icon,label])=>
      <button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>
        <Icon/>
        <span>{label}</span>
      </button>
    )}
  </nav>;
}


function GoogleReviewBonusCard({db,customer,commit,compact=false}){
  const already=(db.history||[]).some(h=>h.customerId===customer.id&&h.type==='google_review_bonus');

  function claim(){
    window.open(googleReviewUrl,'_blank');
    if(already)return;

    const next=addStampToCustomer(db,customer.id,3,'Google yorum bonusu');
    const createdAt=new Date().toLocaleString('tr-TR');

    commit({
      ...next,
      history:[
        {
          id:Date.now()+7,
          customerId:customer.id,
          name:customer.name,
          phone:customer.phone,
          type:'google_review_bonus',
          count:3,
          source:'Google yorum yönlendirme',
          createdAt
        },
        ...(next.history||[])
      ]
    });
  }

  return <div className={compact?'reviewBonusCard compact':'reviewBonusCard'}>
    <div className="reviewBonusGlow"></div>
    <div className="reviewBonusIcon"><Star fill="currentColor"/></div>
    <div className="reviewBonusText">
      <span>GOOGLE YORUM BONUSU</span>
      <h3>Google yorumla 3 damga kazan</h3>
      <p>{already?'Bu üyelik için yorum bonusu daha önce işlendi. Yine de yorum sayfasına gidebilirsin.':'Yorum sayfasına yönlen, 3 bonus damga hesabına hemen işlensin.'}</p>
    </div>
    <button className={already?'ghost':'goldBtn'} onClick={claim}>{already?'Yoruma Git':'3 Damga Kazan'}</button>
  </div>;
}

function HomeScreen({db,customer,card,commit,setTab}){
  const featured=db.items.filter(i=>i.featured).slice(0,6);
  const best=db.items.filter(i=>i.best).slice(0,5);
  const threshold=db.settings.stamp_threshold||10;
  const stamps=card.totalStamps||0;
  const rewards=card.availableRewards||0;
  const progress=Math.min(100,(stamps/threshold)*100);
  const missing=Math.max(0,threshold-stamps);
  const level=card.level||levelByStamps(card.lifetimeStamps||0);
  const greeting=getGreeting();

  return <section className="v4Home">
    <div className="v4Hero">
      <div className="v4Top">
        <div>
          <p>{greeting.label} {greeting.emoji}</p>
          <h1>{customer.name.split(' ')[0]||'Liberte'}</h1>
          <div className="timeBadge"><span>{greeting.time}</span><em>{greeting.tone}</em></div>
        </div>
        <button className="v4Profile"><Crown/></button>
      </div>

      <div className="v4Stats">
        <div>
          <span>Damga</span>
          <b>{stamps}/{threshold}</b>
          <small>{missing} damga kaldı</small>
        </div>

        <div className="v4Center">
          <div className="v4Circle">
            <Coffee/>
          </div>
          <b>{rewards}</b>
          <small>ikram hakkı</small>
        </div>

        <div>
          <span>Seviye</span>
          <b>{level}</b>
          <small>Club üyesi</small>
        </div>
      </div>
    </div>

    <div className="v4Sheet">
      <div className="v4Actions">
        <button onClick={()=>setTab('qr')}><QrCode/> QR Kartım</button>
        <button onClick={()=>setTab('menu')}><ShoppingBag/> Menüye Bak</button>
      </div>

      <div className="v4MemberCard">
        <div>
          <span>LIBERTE CLUB</span>
          <h2>Sadakat Kartı</h2>
          <p>{stamps}/{threshold} damga · {rewards} ödül</p>
        </div>
        <Crown/>
        <div className="progress">
          <span style={{width:`${progress}%`}}></span>
        </div>

        <div className="memberBottom">
          <div>
            <span>SEVİYE</span>
            <b>{level}</b>
          </div>
          <div>
            <span>ÖDÜL</span>
            <b>{rewards}</b>
          </div>
          <div>
            <span>TOPLAM</span>
            <b>{card.lifetimeStamps||0}</b>
          </div>
        </div>
      </div>

      <GoogleReviewBonusCard db={db} customer={customer} commit={commit}/>

      <div className="v4SectionHead">
        <h3>Bunları denedin mi?</h3>
        <button onClick={()=>setTab('menu')}>Tümü →</button>
      </div>

      <div className="v4ProductRail">
        {best.map(i=>
          <article className="v4MiniProduct" key={i.id}>
            <div className="v4MiniVisual">{productImageSrc(i)?<img src={productImageSrc(i)}/>:<span>{i.image||'☕'}</span>}</div>
            <em>Yeni</em>
            <b>{i.name}</b>
          </article>
        )}
      </div>

      <div className="v4SectionHead">
        <h3>Sana özel</h3>
        <button onClick={()=>setTab('campaign')}>Tümü →</button>
      </div>

      <div className="v4Campaigns">
        <div className="v4Campaign dark">
          <span>BUGÜNE ÖZEL</span>
          <h3>Smash Menü + kahve fırsatı</h3>
          <p>Liberte Club üyelerine özel.</p>
          <button onClick={()=>setTab('campaign')}>Detayları Gör</button>
        </div>

        <div className="v4Campaign light">
          <span>YORUM ÖDÜLÜ</span>
          <h3>3 damga bonus</h3>
          <p>Bonus kartı artık ana sayfada görünür şekilde yer alıyor.</p>
          <button onClick={()=>setTab('campaign')}>Bonusu Gör</button>
        </div>
      </div>

      <div className="v4SectionHead">
        <h3>Öne çıkanlar</h3>
      </div>

      <div className="v4List">
        {featured.slice(0,4).map(i=><Product key={i.id} item={i}/>)}
      </div>
    </div>
  </section>;
}

function ReviewCard({db,commit,customer}){
  const[r,setR]=useState(0);

  function send(){
    if(!r)return alert('Önce yıldız seç.');

    const n={
      ...db,
      feedback:[
        {
          id:Date.now(),
          customerId:customer.id,
          name:customer.name,
          rating:r,
          createdAt:new Date().toLocaleString('tr-TR')
        },
        ...(db.feedback||[])
      ]
    };

    commit(n);

    if(r>=5)window.open(googleReviewUrl,'_blank');
    else alert('Teşekkürler. Geri bildirimin admin paneline düştü.');
  }

  return <div className="card review">
    <b>Deneyimini puanla</b>
    <p>5 yıldız verirsen Google yoruma yönlendirelim.</p>

    <div className="stars">
      {[1,2,3,4,5].map(x=>
        <button key={x} onClick={()=>setR(x)} className={x<=r?'on':''}>
          <Star fill="currentColor"/>
        </button>
      )}
    </div>

    <button className="smallBtn" onClick={send}>Gönder</button>
  </div>;
}

async function enablePush(customer,db,commit){
  try{
    if(!('Notification'in window))return alert('Bu cihaz bildirim desteklemiyor.');

    const supported=await isSupported();
    if(!supported)return alert('Bu tarayıcı web push desteklemiyor.');

    let perm=Notification.permission;
    if(perm!=='granted')perm=await Notification.requestPermission();
    if(perm!=='granted')return alert('Bildirim izni verilmedi.');

    const reg=await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const app=initializeApp(firebaseConfig);
    const messaging=getMessaging(app);

    const token=await getToken(messaging,{
      vapidKey:import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration:reg
    });

    if(!token)return alert('Token alınamadı.');

    const exists=(db.pushSubscriptions||[]).some(x=>x.token===token);

    if(!exists){
      commit({
        ...db,
        pushSubscriptions:[
          ...(db.pushSubscriptions||[]),
          {
            id:Date.now(),
            customerId:customer.id,
            name:customer.name,
            phone:customer.phone,
            token,
            createdAt:new Date().toLocaleString('tr-TR')
          }
        ]
      });
    }

    onMessage(messaging,p=>new Notification(p.notification?.title||'Liberte Club',{
      body:p.notification?.body||'Yeni bildirim',
      icon:'/icon.svg'
    }));

    alert('Bildirimler aktif.');
  }catch(e){
    alert('Bildirim kurulamadı: '+e.message);
  }
}

function PushPermission({customer,db,commit}){
  return <div className="card push">
    <div>
      <b>Kampanyaları kaçırma</b>
      <p>Ödül, fırsat ve yeni ürün bildirimleri gelsin.</p>
    </div>
    <button onClick={()=>enablePush(customer,db,commit)}><Bell/> Bildirim Aç</button>
  </div>;
}

function Product({item}){
  return <article className="product">
    <div className="visual" style={{'--tone':item.tone||'#b9f5d0'}}>
      {productImageSrc(item)?<img src={productImageSrc(item)}/>:<span>{item.image||'☕'}</span>}
    </div>

    <div>
      <div className="productTop">
        <b>{item.name}</b>
        {item.featured&&<em>Öne çıkan</em>}
      </div>
      <p>{item.description}</p>
      <strong>{money(item.price)}</strong>
    </div>
  </article>;
}

function MenuScreen({db}){
  const[cat,setCat]=useState('all');
  const cats=db.categories||[];
  const items=cat==='all'?db.items:db.items.filter(i=>String(i.categoryId)===String(cat));

  return <section>
    <div className="menuHero">
      <h2>Menü</h2>
      <p>Favori lezzetini seç, kampanyaları takip et.</p>
    </div>

    <div className="chips">
      <button className={cat==='all'?'on':''} onClick={()=>setCat('all')}>Tümü</button>
      {cats.map(c=>
        <button key={c.id} className={String(cat)===String(c.id)?'on':''} onClick={()=>setCat(c.id)}>
          <span>{c.icon||'•'}</span>{c.name}
        </button>
      )}
    </div>

    <div className="productGrid">
      {items.length?items.map(i=><Product key={i.id} item={i}/>):<div className="empty">Bu kategoride ürün yok.</div>}
    </div>
  </section>;
}

function QrScreen({db,customer,card}){
  const value=JSON.stringify({
    type:'liberte-customer',
    id:customer.id,
    phone:customer.phone
  });

  const threshold=db.settings.stamp_threshold||10;
  const stamps=card.totalStamps||0;
  const rewards=card.availableRewards||0;
  const progress=Math.min(100,(stamps/threshold)*100);
  const level=card.level||levelByStamps(card.lifetimeStamps||0);

  return <section className="qrPage">
    <div className="walletCard">
      <div className="walletTop">
        <div>
          <span>Liberte Club</span>
          <h2>QR Sadakat Kartı</h2>
        </div>
        <Crown/>
      </div>

      <div className="walletUser">
        <b>{customer.name}</b>
        <span>{level} MEMBER</span>
      </div>

      <div className="walletMeta">
        <div>
          <span>ÜYE NO</span>
          <b>LC-{customer.id}</b>
        </div>
        <div>
          <span>SEVİYE</span>
          <b>{level}</b>
        </div>
        <div>
          <span>TOPLAM</span>
          <b>{card.lifetimeStamps||0}</b>
        </div>
      </div>

      <div className="walletQr">
        <QRCodeCanvas value={value} size={230} level="H" includeMargin/>
      </div>

      <div className="walletProgress">
        <div className="progress">
          <span style={{width:`${progress}%`}}></span>
        </div>
        <p>{stamps}/{threshold} damga · {rewards} ödül</p>
      </div>

      <div className="walletNote">
        Kasada bu QR kodu göster. Damgan Liberte Club hesabına işlensin.
      </div>
    </div>
  </section>;
}

function CampaignScreen({db,customer,commit}){
  return <section className="campaignPage">
    <div className="pageHero">
      <span>LIBERTE CLUB</span>
      <h2>Kampanyalar</h2>
      <p>Üyelere özel fırsatlar ve bonus damga avantajları.</p>
    </div>

    <GoogleReviewBonusCard db={db} customer={customer} commit={commit} compact/>

    {(db.campaigns||[]).map(c=>
      <div className="card campaign" key={c.id}>
        <span>{c.emoji||'🎁'}</span>
        <div>
          <b>{c.title}</b>
          <p>{c.body}</p>
        </div>
      </div>
    )}

    <div className="card">
      <b>Seni özledik sistemi</b>
      <p>7 gün gelmeyen müşteriler için özel geri çağırma kampanyası admin panelinden yönetilebilir.</p>
    </div>
  </section>;
}

function AdminScreen({db,commit}){
  const[tab,setTab]=useState('scan');

  return <section>
    <div className="adminHead">
      <h2>Admin Panel</h2>
      <span>{db.customers.length} müşteri</span>
    </div>

    <div className="adminTabs">
      {[
        ['scan','QR'],
        ['items','Ürün'],
        ['cats','Kategori'],
        ['design','Tasarım'],
        ['push','Push'],
        ['users','Kullanıcı'],
        ['history','Geçmiş']
      ].map(x=>
        <button className={tab===x[0]?'on':''} onClick={()=>setTab(x[0])} key={x[0]}>
          {x[1]}
        </button>
      )}
    </div>

    {tab==='scan'&&<ScanPanel db={db} commit={commit}/>}
    {tab==='items'&&<ItemAdmin db={db} commit={commit}/>}
    {tab==='cats'&&<CategoryAdmin db={db} commit={commit}/>}
    {tab==='design'&&<DesignAdmin db={db} commit={commit}/>}
    {tab==='push'&&<PushAdmin db={db} commit={commit}/>}
    {tab==='users'&&<UsersAdmin db={db} commit={commit}/>}
    {tab==='history'&&<HistoryAdmin db={db}/>}
  </section>;
}

function ScanPanel({db,commit}){
  const[active,setActive]=useState(false);
  const[found,setFound]=useState(null);
  const[msg,setMsg]=useState('');
  const scanner=useRef(null);

  useEffect(()=>()=>{try{scanner.current?.stop()}catch{}},[]);

  async function start(){
    setMsg('Kamera açılıyor...');
    setActive(true);

    setTimeout(async()=>{
      try{
        scanner.current=new Html5Qrcode('reader');

        await scanner.current.start(
          {facingMode:'environment'},
          {fps:10,qrbox:240},
          txt=>{
            try{
              const data=JSON.parse(txt);
              const c=db.customers.find(x=>String(x.id)===String(data.id)||x.phone===data.phone);

              if(c){
                setFound(c);
                setMsg('Müşteri bulundu.');
                scanner.current.stop();
                setActive(false);
              }else{
                setMsg('Müşteri bulunamadı.');
              }
            }catch{
              setMsg('QR okunamadı. Geçerli Liberte QR kodu okut.');
            }
          }
        );
      }catch(e){
        setMsg('Kamera açılamadı: '+e.message);
      }
    },100);
  }

  function add(){
    if(!found)return;
    const next=addStampToCustomer(db,found.id,1,'QR kamera');
    commit(next);
    setMsg('+1 damga sisteme kaydedildi.');
  }

  function remove(){
    if(!found)return;
    const next=addStampToCustomer(db,found.id,-1,'QR düzeltme');
    commit(next);
    setMsg('1 damga silindi ve sisteme kaydedildi.');
  }

  function redeem(){
    if(!found)return;
    const ok=confirm(`${found.name} için 1 ikram hakkı kullanılsın mı?`);
    if(!ok)return;
    const next=redeemRewardForCustomer(db,found.id,'QR kasiyer');
    commit(next);
    setMsg('İkram hakkı kullanıldı ve sisteme kaydedildi.');
  }

  const l=found?(db.loyalty[found.id]||loyaltyTemplate(found.id)):null;
  const threshold=db.settings.stamp_threshold||10;

  return <div className="card">
    <button onClick={start}><ScanLine/> Kamera ile QR Okut</button>
    {active&&<div id="reader"></div>}
    <p className="info">{msg||'Müşteri QR kodunu okut. Damga ve ikram işlemleri bulut sisteme kaydedilir.'}</p>

    {found&&<div className="found rewardBox">
      <div>
        <b>{found.name}</b>
        <span>{found.phone} · {found.email||'mail yok'}</span>
      </div>

      <div className="adminStats">
        <div><span>Damga</span><b>{l.totalStamps||0}/{threshold}</b></div>
        <div><span>Hak</span><b>{l.availableRewards||0}</b></div>
        <div><span>Kullanılan</span><b>{l.usedRewards||0}</b></div>
      </div>

      <div className="adminActions">
        <button onClick={add}><Plus/> +1 Damga</button>
        <button className="ghost" onClick={remove}><Minus/> Damga Sil</button>
        <button className="goldBtn" onClick={redeem}><Gift/> Hak Kullandır</button>
      </div>
    </div>}
  </div>;
}

function ItemAdmin({db,commit}){
  const blank={
    name:'',
    price:'',
    description:'',
    categoryId:db.categories[0]?.id||1,
    image:'☕',
    imageUrl:'',
    tone:'#b9f5d0',
    featured:false,
    best:false
  };

  const[f,setF]=useState(blank);

  async function onFile(e){
    const file=e.target.files?.[0];
    if(file)setF({...f,imageUrl:await fileToDataUrl(file)});
  }

  function saveItem(){
    if(!f.name||!f.price)return alert('Ürün adı ve fiyat zorunlu.');
    commit({...db,items:[...db.items,{...f,id:Date.now(),price:Number(f.price)}]});
    setF(blank);
  }

  function upd(id,patch){
    commit({...db,items:db.items.map(i=>i.id===id?{...i,...patch}:i)});
  }

  return <div className="adminGrid">
    <div className="card">
      <h3>Ürün Ekle</h3>
      <input placeholder="Ürün adı" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/>
      <input placeholder="Fiyat" type="number" value={f.price} onChange={e=>setF({...f,price:e.target.value})}/>
      <textarea placeholder="Açıklama" value={f.description} onChange={e=>setF({...f,description:e.target.value})}/>

      <select value={f.categoryId} onChange={e=>setF({...f,categoryId:Number(e.target.value)})}>
        {db.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <input placeholder="Emoji" value={f.image} onChange={e=>setF({...f,image:e.target.value})}/>

      <label className="file">
        <UploadCloud/> Görsel Yükle
        <input type="file" accept="image/*" onChange={onFile}/>
      </label>

      <button onClick={saveItem}><Plus/> Ürün Ekle</button>
    </div>

    <div className="list">
      {db.items.map(i=>
        <div className="card mini" key={i.id}>
          <Product item={i}/>
          <input value={i.name} onChange={e=>upd(i.id,{name:e.target.value})}/>
          <input type="number" value={i.price} onChange={e=>upd(i.id,{price:Number(e.target.value)})}/>
          <button className="danger" onClick={()=>commit({...db,items:db.items.filter(x=>x.id!==i.id)})}>
            <Trash2/> Sil
          </button>
        </div>
      )}
    </div>
  </div>;
}

function CategoryAdmin({db,commit}){
  const[name,setName]=useState('');
  const[icon,setIcon]=useState('✨');

  function add(){
    if(!name.trim())return;
    commit({...db,categories:[...db.categories,{id:Date.now(),name:name.trim(),icon,description:''}]});
    setName('');
  }

  return <div className="card">
    <h3>Kategori Yönetimi</h3>

    <div className="formRow">
      <input placeholder="Kategori adı" value={name} onChange={e=>setName(e.target.value)}/>
      <input placeholder="İkon" value={icon} onChange={e=>setIcon(e.target.value)}/>
      <button onClick={add}><Plus/> Ekle</button>
    </div>

    {db.categories.map(c=>
      <div className="row" key={c.id}>
        <span>{c.icon} {c.name}</span>
        <button className="danger" onClick={()=>commit({
          ...db,
          categories:db.categories.filter(x=>x.id!==c.id),
          items:db.items.map(i=>i.categoryId===c.id?{...i,categoryId:db.categories[0]?.id||1}:i)
        })}>
          <Trash2/> Sil
        </button>
      </div>
    )}
  </div>;
}

function DesignAdmin({db,commit}){
  const s=db.settings;

  async function logo(e){
    const file=e.target.files?.[0];
    if(file)commit({...db,settings:{...s,logo:await fileToDataUrl(file)}});
  }

  function set(p){
    commit({...db,settings:{...s,...p}});
  }

  return <div className="card">
    <h3>Tasarım</h3>

    <label>Logo</label>
    <label className="file">
      <ImageIcon/> Logo Yükle
      <input type="file" accept="image/*" onChange={logo}/>
    </label>

    <label>Arka plan</label>
    <input type="color" value={s.bg} onChange={e=>set({bg:e.target.value})}/>

    <label>Kart rengi</label>
    <input type="color" value={s.card} onChange={e=>set({card:e.target.value})}/>

    <label>Vurgu rengi</label>
    <input type="color" value={s.accent} onChange={e=>set({accent:e.target.value})}/>

    <label>Ana başlık</label>
    <input value={s.hero_title} onChange={e=>set({hero_title:e.target.value})}/>

    <label>Kampanya metni</label>
    <textarea value={s.promo_text} onChange={e=>set({promo_text:e.target.value})}/>

    <button onClick={()=>set({logo:''})}>Logoyu Kaldır</button>
  </div>;
}

function PushAdmin({db,commit}){
  const[title,setTitle]=useState('Liberte Club');
  const[body,setBody]=useState('Bugüne özel kampanya seni bekliyor.');
  const[note,setNote]=useState('');

  async function send(){
    const tokens=(db.pushSubscriptions||[]).map(x=>x.token);

    const n={
      ...db,
      notifications:[
        {id:Date.now(),title,body,createdAt:new Date().toLocaleString('tr-TR')},
        ...(db.notifications||[])
      ]
    };

    commit(n);

    try{
      const r=await fetch('/api/push/send',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({tokens,title,body})
      });

      const j=await r.json();
      setNote(j.note||`${j.sent||0} cihaza gönderildi.`);
    }catch{
      setNote('Uygulama içi bildirim kaydedildi.');
    }
  }

  return <div className="card">
    <h3>Push Bildirim</h3>

    <input value={title} onChange={e=>setTitle(e.target.value)}/>
    <textarea value={body} onChange={e=>setBody(e.target.value)}/>

    <div className="templates">
      <button onClick={()=>{
        setTitle('Smash zamanı 🍔');
        setBody('Bugüne özel Smash Menü seni bekliyor.');
      }}>Smash</button>

      <button onClick={()=>{
        setTitle('Tatlı molası 🍓');
        setBody('Magnolia ve kahve ikilisiyle gününü güzelleştir.');
      }}>Tatlı</button>

      <button onClick={()=>{
        setTitle('Seni özledik ☕');
        setBody('Liberte’ye gel, bugün ekstra damga kazan.');
      }}>Seni özledik</button>
    </div>

    <button onClick={send}><Send/> Gönder</button>

    {note&&<p className="info">{note}</p>}

    <h4>Kayıtlı cihazlar: {(db.pushSubscriptions||[]).length}</h4>
  </div>;
}

function UsersAdmin({db,commit}){
  const[editing,setEditing]=useState(null);
  const[form,setForm]=useState({name:'',phone:'',email:'',birthDate:'',isAdmin:false});
  const[message,setMessage]=useState('');

  const customers=db.customers||[];

  function beginEdit(c){
    setMessage('');
    setEditing(c.id);
    setForm({
      name:c.name||'',
      phone:c.phone||'',
      email:c.email||'',
      birthDate:c.birthDate||'',
      isAdmin:!!c.isAdmin
    });
  }

  function cancelEdit(){
    setEditing(null);
    setMessage('');
  }

  function duplicateCheck(id,phone,email){
    const cleanPhone=norm(phone);
    const cleanEmail=String(email||'').trim().toLowerCase();
    const phoneOwner=customers.find(x=>x.id!==id&&x.phone===cleanPhone);
    const emailOwner=customers.find(x=>x.id!==id&&String(x.email||'').toLowerCase()===cleanEmail);
    if(phoneOwner)return 'Bu telefon numarası başka bir kullanıcıda kayıtlı.';
    if(emailOwner)return 'Bu e-posta adresi başka bir kullanıcıda kayıtlı.';
    return '';
  }

  function saveEdit(c){
    const cleanPhone=norm(form.phone);
    const cleanEmail=String(form.email||'').trim().toLowerCase();
    const cleanName=String(form.name||'').trim();

    if(cleanPhone.length<10){setMessage('Telefon numarası 10 hane olmalı.');return;}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)){setMessage('Geçerli bir e-posta adresi gir.');return;}
    if(cleanName.split(' ').filter(Boolean).length<2){setMessage('İsim soyisim zorunlu.');return;}

    const duplicate=duplicateCheck(c.id,cleanPhone,cleanEmail);
    if(duplicate){setMessage(duplicate);return;}

    const createdAt=new Date().toLocaleString('tr-TR');
    const next={
      ...db,
      customers:customers.map(x=>x.id===c.id?{
        ...x,
        name:cleanName,
        phone:cleanPhone,
        email:cleanEmail,
        birthDate:form.birthDate||'',
        isAdmin:!!form.isAdmin
      }:x),
      pushSubscriptions:(db.pushSubscriptions||[]).map(x=>x.customerId===c.id?{...x,name:cleanName,phone:cleanPhone}:x),
      history:[
        {id:Date.now(),customerId:c.id,name:cleanName,phone:cleanPhone,type:'customer_edit',count:0,source:'Admin kullanıcı düzenleme',createdAt},
        ...(db.history||[])
      ]
    };

    commit(next);
    setEditing(null);
    setMessage('Kullanıcı bilgileri güncellendi.');
  }

  function deleteUser(c){
    if(c.isAdmin){
      const adminCount=customers.filter(x=>x.isAdmin).length;
      if(adminCount<=1){setMessage('Son admin kullanıcı silinemez.');return;}
    }

    const ok=confirm(`${c.name} kullanıcısı silinsin mi? Bu işlem damga ve ödül kayıtlarını da kaldırır.`);
    if(!ok)return;

    const loyalty={...(db.loyalty||{})};
    delete loyalty[c.id];
    const createdAt=new Date().toLocaleString('tr-TR');

    commit({
      ...db,
      customers:customers.filter(x=>x.id!==c.id),
      loyalty,
      pushSubscriptions:(db.pushSubscriptions||[]).filter(x=>x.customerId!==c.id),
      history:[
        {id:Date.now(),customerId:c.id,name:c.name,phone:c.phone,type:'customer_delete',count:0,source:'Admin kullanıcı silme',createdAt},
        ...(db.history||[]).filter(x=>x.customerId!==c.id)
      ]
    });

    setEditing(null);
    setMessage('Kullanıcı silindi.');
  }

  function add(c){
    commit(addStampToCustomer(db,c.id,1,'Admin manuel'));
  }

  function remove(c){
    commit(addStampToCustomer(db,c.id,-1,'Admin düzeltme'));
  }

  function redeem(c){
    const ok=confirm(`${c.name} için 1 ikram hakkı kullanılsın mı?`);
    if(!ok)return;
    commit(redeemRewardForCustomer(db,c.id,'Admin manuel'));
  }

  return <div className="list">
    <div className="card userAdminIntro">
      <h3>Kullanıcı Yönetimi</h3>
      <p>Telefon ve e-posta tekil tutulur. Aynı numara veya aynı mail ikinci kez kullanılamaz.</p>
      {message&&<p className="info">{message}</p>}
    </div>

    {customers.map(c=>{
      const l=db.loyalty[c.id]||loyaltyTemplate(c.id);
      const isEdit=editing===c.id;

      return <div className={isEdit?'card user editing':'card user'} key={c.id}>
        {!isEdit? <>
          <div>
            <b>{c.name}</b>
            <p>{c.phone} · {c.email||'mail yok'} · {c.birthDate||'doğum tarihi yok'} · {l.level||'Bronze'}</p>
            <small>{l.totalStamps||0} damga · {l.availableRewards||0} kullanılabilir hak · {l.usedRewards||0} kullanılan · lifetime {l.lifetimeStamps||0}</small>
          </div>

          <div className="userActions wide">
            <button onClick={()=>add(c)}><Plus/> Damga</button>
            <button className="ghost" onClick={()=>remove(c)}><Minus/> Sil</button>
            <button className="goldBtn" onClick={()=>redeem(c)}><Gift/> Hak Kullan</button>
            <button className="ghost" onClick={()=>beginEdit(c)}>Düzenle</button>
            <button className="danger" onClick={()=>deleteUser(c)}><Trash2/> Kullanıcı Sil</button>
          </div>
        </> : <>
          <div className="userEditForm">
            <h3>Kullanıcı Düzenle</h3>

            <label>İsim Soyisim</label>
            <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>

            <label>Telefon</label>
            <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} inputMode="tel"/>

            <label>E-posta</label>
            <input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} inputMode="email"/>

            <label>Doğum Tarihi</label>
            <input type="date" value={form.birthDate} onChange={e=>setForm({...form,birthDate:e.target.value})}/>

            <label className="adminToggle">
              <input type="checkbox" checked={form.isAdmin} onChange={e=>setForm({...form,isAdmin:e.target.checked})}/>
              <span>Admin yetkisi ver</span>
            </label>

            <div className="editActions">
              <button onClick={()=>saveEdit(c)}><ShieldCheck/> Kaydet</button>
              <button className="ghost" onClick={cancelEdit}>Vazgeç</button>
            </div>
          </div>
        </>}
      </div>;
    })}
  </div>;
}

function HistoryAdmin({db}){
  const rows=(db.history||[]).slice(0,80);
  const label=t=>({
    stamp_add:'Damga eklendi',
    stamp_remove:'Damga silindi',
    reward_redeem:'Hak kullanıldı',
    birthday_reward:'Doğum günü hediyesi',
    welcome_bonus:'Hoş geldin bonusu',
    register:'Kayıt oluşturuldu',
    customer_edit:'Kullanıcı düzenlendi',
    customer_delete:'Kullanıcı silindi'
  }[t]||t);

  return <div className="list">
    <div className="card">
      <h3>Sistem Geçmişi</h3>
      <p>Damga, hak kullanımı ve kayıt işlemleri burada tutulur.</p>
    </div>

    {rows.length?rows.map(h=>
      <div className="card historyRow" key={h.id}>
        <div>
          <b>{label(h.type)}</b>
          <p>{h.name||'Müşteri'} · {h.phone||''}</p>
          <small>{h.createdAt} · {h.source||'Sistem'}</small>
        </div>
        <strong>{h.type==='reward_redeem'?'Hak':h.count>0?`+${h.count}`:h.count}</strong>
      </div>
    ):<div className="empty">Henüz işlem geçmişi yok.</div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
