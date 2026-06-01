import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{QRCodeCanvas}from'qrcode.react';
import{Html5Qrcode}from'html5-qrcode';
import{initializeApp}from'firebase/app';
import{getMessaging,getToken,isSupported,onMessage}from'firebase/messaging';
import{Bell,Coffee,Crown,Gift,Home,Image as ImageIcon,Instagram,LogOut,Mail,MapPin,Menu as MenuIcon,Minus,Plus,QrCode,ScanLine,Send,ShieldCheck,ShoppingBag,Sparkles,Star,Trash2,UploadCloud}from'lucide-react';
import'./style.css';

const firebaseConfig={apiKey:'AIzaSyCDWpSpPoEsMirO0Grbpbabaju7QALVERC',authDomain:'liberte-club.firebaseapp.com',projectId:'liberte-club',storageBucket:'liberte-club.firebasestorage.app',messagingSenderId:'605225271131',appId:'1:605225271131:web:d03f217cfd9445a193e47e',measurementId:'G-HRKRV78XGS'};

const googleReviewUrl='https://www.google.com/search?q=Liberte+Gastro+Cafe+Sakarya+yorum';
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

function fileToDataUrl(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=rej;
    r.readAsDataURL(file);
  });
}

function addStampToCustomer(db,id,count=1,source='Admin'){
  const customer=db.customers.find(c=>c.id===id);
  if(!customer)return db;

  const current=db.loyalty[id]||{
    customerId:id,
    totalStamps:0,
    availableRewards:0,
    usedRewards:0,
    lifetimeStamps:0,
    level:'Bronze'
  };

  let total=Math.max(0,(current.totalStamps||0)+count);
  let rewards=current.availableRewards||0;
  const threshold=db.settings.stamp_threshold||10;

  while(total>=threshold){
    total-=threshold;
    rewards+=1;
  }

  const lifetime=Math.max(0,(current.lifetimeStamps||0)+Math.max(count,0));

  return{
    ...db,
    loyalty:{
      ...db.loyalty,
      [id]:{
        ...current,
        totalStamps:total,
        availableRewards:rewards,
        lifetimeStamps:lifetime,
        level:levelByStamps(lifetime)
      }
    },
    history:[
      {
        id:Date.now(),
        customerId:id,
        name:customer.name,
        type:count>=0?'stamp':'remove',
        count,
        source,
        createdAt:new Date().toLocaleString('tr-TR')
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

  if(!session){
    return <main style={cssVars(db.settings)}>
      <Login db={db} commit={commit} setSession={setSession}/>
    </main>;
  }

  const customer=db.customers.find(c=>c.id===session.customerId)||db.customers[0];
  const card=db.loyalty[customer.id]||{};

  return <main className="app" style={cssVars(db.settings)}>
    <Header db={db} customer={customer} setSession={setSession} sync={sync}/>

    {tab==='home'&&<HomeScreen db={db} customer={customer} card={card} commit={commit} setTab={setTab}/>}
    {tab==='menu'&&<MenuScreen db={db}/>}
    {tab==='qr'&&<QrScreen db={db} customer={customer} card={card}/>}
    {tab==='campaign'&&<CampaignScreen db={db}/>}
    {tab==='admin'&&customer.isAdmin&&<AdminScreen db={db} commit={commit}/>}

    <Nav tab={tab} setTab={setTab} admin={customer.isAdmin}/>
  </main>;
}

function Login({db,commit,setSession}){
  const[phone,setPhone]=useState('');
  const[name,setName]=useState('');
  const[email,setEmail]=useState('');
  const[code,setCode]=useState('');
  const[step,setStep]=useState('form');
  const[loading,setLoading]=useState(false);
  const[info,setInfo]=useState('');

  const valid=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const fields=()=>{
    const ph=norm(phone);
    const nm=name.trim();
    const em=email.trim().toLowerCase();

    if(ph.length<10){
      alert('Telefonu 10 hane gir.');
      return null;
    }

    if(nm.split(' ').filter(Boolean).length<2){
      alert('İsim soyisim zorunlu.');
      return null;
    }

    if(!valid(em)){
      alert('Geçerli e-posta gir.');
      return null;
    }

    return{ph,nm,em};
  };

  function loginCustomer(f){
    let next=mergeDb(db);
    let c=next.customers.find(x=>x.phone===f.ph);

    if(c){
      c.name=f.nm;
      c.email=f.em;
    }else{
      c={
        id:Date.now(),
        phone:f.ph,
        name:f.nm,
        email:f.em,
        isAdmin:f.ph==='5058665406',
        createdAt:new Date().toLocaleString('tr-TR')
      };

      next.customers=[...next.customers,c];

      next.loyalty={
        ...next.loyalty,
        [c.id]:{
          customerId:c.id,
          totalStamps:0,
          availableRewards:0,
          usedRewards:0,
          lifetimeStamps:0,
          level:'Bronze'
        }
      };
    }

    commit(next);
    setSession({customerId:c.id});
  }

  async function sendCode(){
    const f=fields();
    if(!f)return;

    setLoading(true);
    setInfo('');

    try{
      const r=await fetch('/api/auth/send-code',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          phone:f.ph,
          name:f.nm,
          email:f.em
        })
      });

      const text=await r.text();
      const j=text?JSON.parse(text):{};

      if(!r.ok){
        throw new Error(j.error||'Kod gönderilemedi');
      }

      setStep('code');
      setInfo('Kod e-posta adresine gönderildi.');
    }catch(e){
      alert(e.message||'Kod gönderilemedi');
    }finally{
      setLoading(false);
    }
  }

  async function verify(){
    const f=fields();
    if(!f)return;

    if(code.replace(/\D/g,'').length!==6){
      alert('6 haneli kodu gir.');
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

      loginCustomer(f);
    }catch(e){
      alert(e.message||'Kod doğrulanamadı');
    }finally{
      setLoading(false);
    }
  }

  return <section className="loginPage">
    <div className="orb one"></div>
    <div className="orb two"></div>

    <div className="loginCard">
      <Brand db={db}/>

      <h1>{db.settings.app_name}</h1>
      <p>QR sadakat kartı, özel kampanyalar ve Liberte ayrıcalıkları.</p>

      {step==='form'?<>
        <label>Telefon</label>
        <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="0505 866 54 06"/>

        <label>İsim Soyisim <em>*</em></label>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ad Soyad"/>

        <label>E-posta <em>*</em></label>
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="mail@ornek.com"/>

        <button disabled={loading} onClick={sendCode}>
          <Mail/> {loading?'Gönderiliyor...':'Mail Kod Gönder'}
        </button>

        {info&&<p className="info">{info}</p>}
      </>:<>
        <label>Mail kodu</label>
        <input value={code} maxLength={6} onChange={e=>setCode(e.target.value)} placeholder="6 haneli kod"/>

        <button disabled={loading} onClick={verify}>
          <ShieldCheck/> {loading?'Kontrol ediliyor...':'Giriş Yap'}
        </button>

        <button className="ghost" onClick={()=>setStep('form')}>
          Bilgileri değiştir
        </button>

        {info&&<p className="info">{info}</p>}
      </>}
    </div>
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

function HomeScreen({db,customer,card,commit,setTab}){
  const featured=db.items.filter(i=>i.featured).slice(0,6);
  const best=db.items.filter(i=>i.best).slice(0,5);
  const threshold=db.settings.stamp_threshold||10;
  const stamps=card.totalStamps||0;
  const rewards=card.availableRewards||0;
  const progress=Math.min(100,(stamps/threshold)*100);
  const missing=Math.max(0,threshold-stamps);
  const level=card.level||levelByStamps(card.lifetimeStamps||0);

  return <section className="v4Home">
    <div className="v4Hero">
      <div className="v4Top">
        <div>
          <p>İyi akşamlar ☕</p>
          <h1>{customer.name.split(' ')[0]||'Liberte'}</h1>
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
      </div>

      <div className="v4SectionHead">
        <h3>Bunları denedin mi?</h3>
        <button onClick={()=>setTab('menu')}>Tümü →</button>
      </div>

      <div className="v4ProductRail">
        {best.map(i=>
          <article className="v4MiniProduct" key={i.id}>
            <div className="v4MiniVisual">{i.imageUrl?<img src={i.imageUrl}/>:<span>{i.image||'☕'}</span>}</div>
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
          <h3>Google yorumuna bonus damga</h3>
          <p>Deneyimini paylaş, ayrıcalık kazan.</p>
          <button onClick={()=>window.open(googleReviewUrl,'_blank')}>Yorum Yap</button>
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
      {item.imageUrl?<img src={item.imageUrl}/>:<span>{item.image||'☕'}</span>}
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

function CampaignScreen({db}){
  return <section>
    <h2>Kampanyalar</h2>

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
        ['users','Kullanıcı']
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
    commit(addStampToCustomer(db,found.id,1,'QR kamera'));
    setMsg('+1 damga eklendi.');
  }

  return <div className="card">
    <button onClick={start}><ScanLine/> Kamera ile QR Okut</button>
    {active&&<div id="reader"></div>}
    <p className="info">{msg}</p>

    {found&&<div className="found">
      <b>{found.name}</b>
      <span>{found.phone}</span>
      <button onClick={add}><Plus/> +1 Damga</button>
      <button className="ghost" onClick={()=>commit(addStampToCustomer(db,found.id,-1,'Düzeltme'))}>
        <Minus/> Damga Sil
      </button>
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
  return <div className="list">
    {db.customers.map(c=>{
      const l=db.loyalty[c.id]||{};

      return <div className="card user" key={c.id}>
        <div>
          <b>{c.name}</b>
          <p>{c.phone} · {c.email||'mail yok'} · {l.level||'Bronze'}</p>
          <small>{l.totalStamps||0} damga · {l.availableRewards||0} ödül · lifetime {l.lifetimeStamps||0}</small>
        </div>

        <button onClick={()=>commit(addStampToCustomer(db,c.id,1,'Manuel'))}>
          <Plus/> Damga
        </button>
      </div>;
    })}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
