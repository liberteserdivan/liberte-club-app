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
  referrals:[],
  automationLog:[],
  checkIns:[],
  coupons:[{id:1,code:'LIBERTE10',title:'Hoş Geldin Kuponu',rewardType:'stamp',rewardValue:1,active:true,createdAt:new Date().toLocaleString('tr-TR')}],
  couponUses:[],
  dailyClaims:[],
  wheelSpins:[],
  firstOrderBonuses:[],
  customerNotes:{},
  dailyCampaign:{id:1,title:'Bugünün Kampanyası',body:'2 Latte alana +1 bonus damga',active:true,rewardType:'stamp',rewardValue:1,emoji:'☕'},
  wheelPrizes:[
    {id:1,label:'+1 Damga',type:'stamp',value:1,weight:35},
    {id:2,label:'+2 Damga',type:'stamp',value:2,weight:18},
    {id:3,label:'1 İçecek Hakkı',type:'reward',value:1,weight:6},
    {id:4,label:'Tatlı Molası',type:'message',value:0,weight:8},
    {id:5,label:'Bugün Şanslı Gün',type:'stamp',value:3,weight:3},
    {id:6,label:'Tekrar Dene',type:'message',value:0,weight:30}
  ],
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
    referrals:x.referrals||[],
    automationLog:x.automationLog||[],
    checkIns:x.checkIns||[],
    coupons:x.coupons||seed.coupons,
    couponUses:x.couponUses||[],
    dailyClaims:x.dailyClaims||[],
    wheelSpins:x.wheelSpins||[],
    firstOrderBonuses:x.firstOrderBonuses||[],
    customerNotes:x.customerNotes||{},
    dailyCampaign:{...seed.dailyCampaign,...(x.dailyCampaign||{})},
    wheelPrizes:x.wheelPrizes||seed.wheelPrizes,
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

function makeReferralCode(name='',phone='',id=''){
  const base=String(name||'LIBERTE')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9]/g,'')
    .toUpperCase()
    .slice(0,6)||'LIBERTE';
  const tail=String(phone||id||Date.now()).replace(/\D/g,'').slice(-4)||String(id).slice(-4);
  return `${base}${tail}`;
}

function getReferralCode(customer){
  return customer?.referralCode||makeReferralCode(customer?.name,customer?.phone,customer?.id);
}

function findReferrerByCode(db,code){
  const clean=String(code||'').trim().toUpperCase().replace(/\s/g,'');
  if(!clean)return null;
  return (db.customers||[]).find(c=>getReferralCode(c)===clean)||null;
}

function daysSince(dateText){
  if(!dateText)return 999;
  const d=new Date(dateText);
  if(Number.isNaN(d.getTime()))return 999;
  return Math.floor((Date.now()-d.getTime())/(1000*60*60*24));
}


function localDayKey(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function hasDailyClaim(db,customerId,type){
  const day=localDayKey();
  return (db.dailyClaims||[]).some(x=>x.customerId===customerId&&x.type===type&&x.day===day);
}

function claimDailyLoginReward(db,customerId){
  const customer=db.customers.find(c=>c.id===customerId);
  if(!customer)return db;
  const day=localDayKey();
  if(hasDailyClaim(db,customerId,'daily_login')){alert('Günlük giriş ödülünü bugün zaten aldın.');return db;}
  const createdAt=new Date().toLocaleString('tr-TR');
  let next=addStampToCustomer(db,customerId,1,'Günlük giriş ödülü');
  return{...next,dailyClaims:[{id:Date.now(),customerId,name:customer.name,phone:customer.phone,type:'daily_login',day,createdAt},...(next.dailyClaims||[])]};
}

function claimFirstOrderBonus(db,customerId){
  const customer=db.customers.find(c=>c.id===customerId);
  if(!customer)return db;
  if((db.firstOrderBonuses||[]).some(x=>x.customerId===customerId)){alert('İlk alışveriş bonusu bu üyelikte daha önce kullanıldı.');return db;}
  const createdAt=new Date().toLocaleString('tr-TR');
  let next=addStampToCustomer(db,customerId,3,'İlk alışveriş bonusu');
  return{...next,firstOrderBonuses:[{id:Date.now(),customerId,name:customer.name,phone:customer.phone,createdAt},...(next.firstOrderBonuses||[])]};
}

function weightedPrize(prizes=[]){
  const list=prizes.length?prizes:seed.wheelPrizes;
  const total=list.reduce((a,p)=>a+Number(p.weight||1),0);
  let r=Math.random()*total;
  for(const p of list){
    r-=Number(p.weight||1);
    if(r<=0)return p;
  }
  return list[0];
}

function spinLuckyWheel(db,customerId){
  const customer=db.customers.find(c=>c.id===customerId);
  if(!customer)return db;
  const day=localDayKey();
  if((db.wheelSpins||[]).some(x=>x.customerId===customerId&&x.day===day)){alert('Şans çarkını bugün zaten çevirdin.');return db;}
  const prize=weightedPrize(db.wheelPrizes);
  const createdAt=new Date().toLocaleString('tr-TR');
  let next={...db};
  if(prize.type==='stamp')next=addStampToCustomer(next,customerId,Number(prize.value||1),'Şans çarkı');
  if(prize.type==='reward'){
    const current=next.loyalty[customerId]||loyaltyTemplate(customerId);
    next={...next,loyalty:{...next.loyalty,[customerId]:{...current,availableRewards:(current.availableRewards||0)+Number(prize.value||1),updatedAt:createdAt}}};
  }
  return{
    ...next,
    wheelSpins:[{id:Date.now(),customerId,name:customer.name,phone:customer.phone,day,prize:prize.label,type:prize.type,value:prize.value,createdAt},...(next.wheelSpins||[])],
    history:[{id:Date.now()+2,customerId,name:customer.name,phone:customer.phone,type:'wheel_spin',count:Number(prize.value||0),source:`Şans çarkı: ${prize.label}`,createdAt},...(next.history||[])]
  };
}

function vipBenefits(level='Bronze'){
  const map={
    Bronze:['Damga toplama','Google yorum bonusu','Günlük giriş ödülü'],
    Silver:['Bronze avantajları','Ayda özel kampanya','Doğum günü önceliği'],
    Gold:['Silver avantajları','VIP kampanya erişimi','Haftalık şans çarkı bonusları'],
    Black:['Gold avantajları','Özel ikram günleri','Premium Club ayrıcalıkları']
  };
  return map[level]||map.Bronze;
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


function calculateCoins(l){
  return Math.max(0,Math.floor((l?.lifetimeStamps||0)*10 + (l?.usedRewards||0)*50));
}

function customerBadges(customer,loyalty,db){
  const h=(db.history||[]).filter(x=>x.customerId===customer.id);
  const badges=[];
  const lifetime=loyalty?.lifetimeStamps||0;
  if(lifetime>=5)badges.push({emoji:'☕',title:'Kahve Yolcusu',desc:'5+ damga'});
  if(lifetime>=20)badges.push({emoji:'⭐',title:'Sadık Üye',desc:'20+ damga'});
  if(lifetime>=50)badges.push({emoji:'👑',title:'Gold Club',desc:'50+ damga'});
  if((loyalty?.usedRewards||0)>=1)badges.push({emoji:'🎁',title:'Ödül Avcısı',desc:'İlk ikramını kullandı'});
  if(h.some(x=>x.type==='google_review_bonus'))badges.push({emoji:'💬',title:'Yorum Elçisi',desc:'Google yorumu'});
  if((db.referrals||[]).some(x=>x.referrerId===customer.id))badges.push({emoji:'🤝',title:'Davetçi',desc:'Arkadaş daveti'});
  return badges.length?badges:[{emoji:'🌿',title:'Yeni Üye',desc:'Liberte Club'}];
}

function checkInCustomer(db,customerId,source='QR Check-in'){
  const customer=db.customers.find(c=>c.id===customerId);
  if(!customer)return db;
  const today=new Date().toLocaleDateString('tr-TR');
  const already=(db.checkIns||[]).some(x=>x.customerId===customerId&&String(x.date)===today);
  if(already){alert('Bu müşteri bugün zaten check-in yaptı.');return db;}
  const createdAt=new Date().toLocaleString('tr-TR');
  let next={...db,customers:db.customers.map(c=>c.id===customerId?{...c,lastVisit:createdAt}:c),checkIns:[{id:Date.now(),customerId,name:customer.name,phone:customer.phone,date:today,createdAt,source},...(db.checkIns||[])],history:[{id:Date.now()+1,customerId,name:customer.name,phone:customer.phone,type:'check_in',count:0,source,createdAt},...(db.history||[])]};
  const visits=(next.checkIns||[]).filter(x=>x.customerId===customerId).length;
  if(visits>0&&visits%5===0)next=addStampToCustomer(next,customerId,1,'5 ziyaret bonusu');
  return next;
}

function applyCouponToCustomer(db,customerId,rawCode){
  const code=String(rawCode||'').trim().toUpperCase();
  if(!code){alert('Kupon kodu gir.');return db;}
  const customer=db.customers.find(c=>c.id===customerId);
  const coupon=(db.coupons||[]).find(c=>String(c.code||'').toUpperCase()===code&&c.active!==false);
  if(!customer||!coupon){alert('Kupon bulunamadı veya pasif.');return db;}
  const used=(db.couponUses||[]).some(x=>x.customerId===customerId&&String(x.code||'').toUpperCase()===code);
  if(used){alert('Bu kupon daha önce kullanılmış.');return db;}
  const createdAt=new Date().toLocaleString('tr-TR');
  let next={...db,couponUses:[{id:Date.now(),customerId,name:customer.name,phone:customer.phone,code,title:coupon.title,createdAt},...(db.couponUses||[])],history:[{id:Date.now()+1,customerId,name:customer.name,phone:customer.phone,type:'coupon_use',count:Number(coupon.rewardValue||0),source:`Kupon ${code}`,createdAt},...(db.history||[])]};
  if(coupon.rewardType==='reward'){
    const current=next.loyalty[customerId]||loyaltyTemplate(customerId);
    next={...next,loyalty:{...next.loyalty,[customerId]:{...current,availableRewards:(current.availableRewards||0)+Number(coupon.rewardValue||1)}}};
  }else{
    next=addStampToCustomer(next,customerId,Number(coupon.rewardValue||1),`Kupon ${code}`);
  }
  return next;
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
  const[installPrompt,setInstallPrompt]=useState(null);

  useEffect(()=>{
    const handler=e=>{
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt',handler);
    return()=>window.removeEventListener('beforeinstallprompt',handler);
  },[]);

  useEffect(()=>{
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(()=>{});
    }
  },[]);

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
    {tab==='home'&&<HomeScreen db={db} customer={customer} card={card} commit={commit} setTab={setTab} setSession={setSession} sync={sync} installPrompt={installPrompt} setInstallPrompt={setInstallPrompt}/>}
    {tab==='menu'&&<MenuScreen db={db}/>}
    {tab==='qr'&&<QrScreen db={db} customer={customer} card={card}/>}
    {tab==='campaign'&&<CampaignScreen db={db} customer={customer} commit={commit}/>}
    {tab==='admin'&&customer.isAdmin&&<AdminScreen db={db} commit={commit}/>}

    <OfflineNotice/>
    <Nav tab={tab} setTab={setTab} admin={customer.isAdmin}/>
  </main>;
}

function Login({db,commit,setSession}){
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



function CustomerHistoryCard({db,customer}){
  const rows=(db.history||[]).filter(h=>h.customerId===customer.id).slice(0,5);

  const label=h=>({
    stamp_add:'Damga eklendi',
    stamp_remove:'Damga silindi',
    reward_redeem:'İkram kullanıldı',
    birthday_reward:'Doğum günü hediyesi',
    welcome_bonus:'Hoş geldin bonusu',
    google_review_bonus:'Google yorum bonusu',
    register:'Kayıt oluşturuldu',
    referral_bonus:'Referans bonusu',
    wheel_spin:'Şans çarkı',
    daily_login:'Günlük giriş ödülü',
    first_order_bonus:'İlk sipariş bonusu',
    login:'Giriş yapıldı'
  }[h.type]||h.source||'İşlem');

  const badge=h=>{
    if(h.type==='reward_redeem')return 'Hak';
    if(h.type==='birthday_reward')return '+1';
    if(h.type==='google_review_bonus')return '+3';
    if(h.count>0)return `+${h.count}`;
    return h.count||'•';
  };

  return <div className="customerHistory card">
    <div className="historyTitle">
      <div>
        <span>HESAP HAREKETLERİ</span>
        <h3>Son İşlemler</h3>
      </div>
    </div>

    {rows.length?rows.map(h=>
      <div className="historyMini" key={h.id}>
        <div>
          <b>{label(h)}</b>
          <p>{h.createdAt} · {h.source||'Liberte Club'}</p>
        </div>
        <strong>{badge(h)}</strong>
      </div>
    ):<p className="emptySmall">Henüz işlem geçmişi yok. İlk damganı kasada QR ile alabilirsin.</p>}
  </div>;
}


function ReferralCard({db,customer}){
  const code=getReferralCode(customer);
  const invited=(db.referrals||[]).filter(r=>r.referrerId===customer.id).length;
  const shareText=`Liberte Club'a katıl, kayıt olurken ${code} kodunu kullan. İkimiz de +2 damga kazanalım.`;

  async function copy(){
    try{await navigator.clipboard.writeText(code);alert('Referans kodun kopyalandı.');}
    catch{alert(`Referans kodun: ${code}`);}
  }

  async function share(){
    if(navigator.share){
      try{await navigator.share({title:'Liberte Club Davet',text:shareText,url:'https://app.liberte.cafe'});return;}catch{}
    }
    copy();
  }

  return <div className="referralCard">
    <div>
      <span>ARKADAŞINI DAVET ET</span>
      <h3>+2 damga sen, +2 damga arkadaşın</h3>
      <p>Kayıtta bu kod kullanıldığında bonus damgalar otomatik işlenir.</p>
    </div>
    <div className="referralCodeBox">
      <small>Davet Kodun</small>
      <b>{code}</b>
      <em>{invited} davet</em>
    </div>
    <div className="referralActions">
      <button className="goldBtn" onClick={share}>Davet Et</button>
      <button className="ghost" onClick={copy}>Kodu Kopyala</button>
    </div>
  </div>;
}

function GoogleReviewBonusCard({db,customer,commit,compact=false}){
  const requests=db.googleReviewRequests||[];
  const approved=(db.history||[]).some(h=>h.customerId===customer.id&&h.type==='google_review_bonus');
  const pending=requests.some(r=>r.customerId===customer.id&&r.status==='pending');

  function requestBonus(){
    window.open(googleReviewUrl,'_blank','noopener,noreferrer');
    if(approved){alert('Google yorum bonusun daha önce işlendi.');return;}
    if(pending){alert('Yorum talebin admin onayı bekliyor.');return;}
    const createdAt=new Date().toLocaleString('tr-TR');
    commit({
      ...db,
      googleReviewRequests:[
        {id:Date.now(),customerId:customer.id,name:customer.name,phone:customer.phone,email:customer.email,status:'pending',createdAt},
        ...requests
      ],
      notifications:[
        {id:Date.now()+1,customerId:customer.id,title:'Google yorum talebi alındı',body:'Yorum bonusun admin onayından sonra hesabına işlenecek.',createdAt},
        ...(db.notifications||[])
      ],
      history:[
        {id:Date.now()+2,customerId:customer.id,name:customer.name,phone:customer.phone,type:'google_review_request',count:0,source:'Google yorum onay talebi',createdAt},
        ...(db.history||[])
      ]
    });
    alert('Yorum sayfası açıldı. Yorumu tamamladıktan sonra talebin admin onayına düştü.');
  }

  return <div className={compact?'reviewBonusCard compact':'reviewBonusCard'}>
    <div className="reviewBonusGlow"></div>
    <div className="reviewBonusIcon"><Star fill="currentColor"/></div>
    <div className="reviewBonusText">
      <span>GOOGLE YORUM BONUSU</span>
      <h3>Google yorumla 3 damga kazan</h3>
      <p>{approved?'Bu üyelik için yorum bonusu işlendi.':pending?'Talebin admin onayı bekliyor.':'Yorum sayfasına git, sonra admin onayıyla +3 damga hesabına işlensin.'}</p>
    </div>
    <button className={approved||pending?'ghost':'goldBtn'} onClick={requestBonus}>{approved?'Yoruma Git':pending?'Onay Bekliyor':'Yorum Yap'}</button>
  </div>;
}

function InstallAppCard({installPrompt,setInstallPrompt}){
  const[isStandalone,setIsStandalone]=useState(false);

  useEffect(()=>{
    const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone;
    setIsStandalone(Boolean(standalone));
  },[]);

  async function install(){
    if(installPrompt){
      installPrompt.prompt();
      await installPrompt.userChoice.catch(()=>{});
      setInstallPrompt(null);
      return;
    }
    alert('iPhone kullanıyorsan Safari paylaş menüsünden "Ana Ekrana Ekle" seçeneğini kullanabilirsin.');
  }

  if(isStandalone)return null;

  return <div className="installCard">
    <div>
      <span>UYGULAMA GİBİ KULLAN</span>
      <b>Liberte Club ana ekranında dursun</b>
      <p>QR kartına, kampanyalara ve ödüllerine tek dokunuşla ulaş.</p>
    </div>
    <button onClick={install}>Ana Ekrana Ekle</button>
  </div>;
}

function OfflineNotice(){
  const[online,setOnline]=useState(typeof navigator==='undefined'?true:navigator.onLine);
  useEffect(()=>{
    const on=()=>setOnline(true);
    const off=()=>setOnline(false);
    window.addEventListener('online',on);
    window.addEventListener('offline',off);
    return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);};
  },[]);
  if(online)return null;
  return <div className="offlineToast">Bağlantı yok. Liberte Club yerel kayıtla çalışmaya devam ediyor.</div>;
}

function HomeQuickDock({setTab,onWheel,wheelDone}){
  return <nav className="homeQuickDock" aria-label="Hızlı erişim">
    <button type="button" onClick={()=>setTab('qr')}><QrCode/><span>QR Kart</span></button>
    <button type="button" onClick={()=>setTab('menu')}><ShoppingBag/><span>Menü</span></button>
    <button type="button" className={`wheelHub${wheelDone?' done':''}`} onClick={onWheel}><Sparkles/><span>Çark</span></button>
    <button type="button" onClick={()=>setTab('campaign')}><Gift/><span>Fırsat</span></button>
  </nav>;
}

function HomeScreen({db,customer,card,commit,setTab,setSession,sync,installPrompt,setInstallPrompt}){
  const wheelRef=useRef(null);
  const featured=db.items.filter(i=>i.featured).slice(0,6);
  const best=db.items.filter(i=>i.best).slice(0,5);
  const threshold=db.settings.stamp_threshold||10;
  const stamps=card.totalStamps||0;
  const rewards=card.availableRewards||0;
  const progress=Math.min(100,(stamps/threshold)*100);
  const missing=Math.max(0,threshold-stamps);
  const level=card.level||levelByStamps(card.lifetimeStamps||0);
  const greeting=getGreeting();
  const wheelDone=!!(db.wheelSpins||[]).find(x=>x.customerId===customer.id&&x.day===localDayKey());

  // Çark dock'tan tetiklenir; çevrildiyse kart bölümüne kaydırır
  function handleWheelDock(){
    if(wheelDone){
      wheelRef.current?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    commit(spinLuckyWheel(db,customer.id));
  }

  return <section className="v4Home homePro">
    <div className="homeHeroPro">
      <Header db={db} customer={customer} setSession={setSession} sync={sync}/>
      <div className="homeWelcome">
        <div>
          <p className="homeGreet">{greeting.label} {greeting.emoji}</p>
          <h1>{customer.name.split(' ')[0]||'Liberte'}</h1>
          <div className="homeTimeBadge"><span>{greeting.time}</span><em>{greeting.tone}</em></div>
        </div>
        <div className="homeLevelPill"><Crown/><span>{level}</span></div>
      </div>

      <div className="homeLoyaltyStrip">
        <div><small>Damga</small><b>{stamps}<span>/{threshold}</span></b><em>{missing} kaldı</em></div>
        <div className="homeLoyaltyMain"><Coffee/><b>{rewards}</b><em>ikram hakkı</em></div>
        <div><small>Toplam</small><b>{card.lifetimeStamps||0}</b><em>lifetime</em></div>
      </div>

      <div className="homeHeroProgress" aria-hidden="true">
        <span style={{width:`${progress}%`}}/>
      </div>
    </div>

    <HomeQuickDock setTab={setTab} onWheel={handleWheelDock} wheelDone={wheelDone}/>

    <div className="homeBody">
      <InstallAppCard installPrompt={installPrompt} setInstallPrompt={setInstallPrompt}/>

      <div className="homeSection">
        <p className="homeSectionLabel">Sadakat kartın</p>
        <div className="v4MemberCard homeWalletCard">
          <div>
            <span>LIBERTE CLUB</span>
            <h2>Sadakat Kartı</h2>
            <p>{stamps}/{threshold} damga · {rewards} ödül · {db.settings.reward_description||'1 Bedava İçecek'}</p>
          </div>
          <Crown/>
          <div className="progress"><span style={{width:`${progress}%`}}/></div>
          <div className="memberBottom">
            <div><span>SEVİYE</span><b>{level}</b></div>
            <div><span>ÖDÜL</span><b>{rewards}</b></div>
            <div><span>TOPLAM</span><b>{card.lifetimeStamps||0}</b></div>
          </div>
        </div>
        <div className="homePrimaryActions">
          <button type="button" className="homePrimaryBtn" onClick={()=>setTab('qr')}><QrCode/> Kasada Göster</button>
          <button type="button" className="homePrimaryBtn ghost" onClick={()=>setTab('menu')}><ShoppingBag/> Menüyü Gör</button>
        </div>
      </div>

      <div className="homeSection">
        <p className="homeSectionLabel">Bugünün fırsatları</p>
        <DailyCampaignCard db={db} setTab={setTab}/>
        <div className="homeRewardStack">
          <DailyRewardCard db={db} customer={customer} commit={commit}/>
          <FirstOrderBonusCard db={db} customer={customer} commit={commit}/>
        </div>
      </div>

      <div className="homeSection">
        <p className="homeSectionLabel">Ödüller & avantajlar</p>
        <RewardsCenterCard db={db} customer={customer} card={card} commit={commit}/>
        <GoogleReviewBonusCard db={db} customer={customer} commit={commit}/>
        <div ref={wheelRef} id="lucky-wheel" className="homeWheelAnchor">
          <LuckyWheelCard db={db} customer={customer} commit={commit}/>
        </div>
        <VipBenefitsCard db={db} customer={customer}/>
      </div>

      <div className="homeSection">
        <p className="homeSectionLabel">Hesabım</p>
        <ReferralCard db={db} customer={customer}/>
        <CustomerHistoryCard db={db} customer={customer}/>
        <NotificationCenterCard db={db} customer={customer}/>
      </div>

      <div className="homeSection">
        <p className="homeSectionLabel">Keşfet</p>
        <div className="homeSubHead">
          <h3>Bunları denedin mi?</h3>
          <button type="button" className="homeLinkBtn" onClick={()=>setTab('menu')}>Tümü →</button>
        </div>
        <div className="v4ProductRail homeProductRail">
          {best.map(i=>
            <article className="v4MiniProduct" key={i.id}>
              <div className="v4MiniVisual">{productImageSrc(i)?<img src={productImageSrc(i)} alt=""/>:<span>{i.image||'☕'}</span>}</div>
              <em>Yeni</em>
              <b>{i.name}</b>
            </article>
          )}
        </div>

        <div className="homeSubHead">
          <h3>Sana özel</h3>
          <button type="button" className="homeLinkBtn" onClick={()=>setTab('campaign')}>Tümü →</button>
        </div>
        <div className="v4Campaigns homeCampaignRail">
          <div className="v4Campaign dark">
            <span>BUGÜNE ÖZEL</span>
            <h3>Smash Menü + kahve fırsatı</h3>
            <p>Liberte Club üyelerine özel.</p>
            <button type="button" onClick={()=>setTab('campaign')}>Detayları Gör</button>
          </div>
          <div className="v4Campaign light">
            <span>YORUM ÖDÜLÜ</span>
            <h3>3 damga bonus</h3>
            <p>Google yorumunla ekstra damga kazan.</p>
            <button type="button" onClick={()=>setTab('campaign')}>Bonusu Gör</button>
          </div>
        </div>

        <div className="homeSubHead"><h3>Öne çıkanlar</h3></div>
        <div className="v4List homeFeaturedList">
          {featured.slice(0,4).map(i=><Product key={i.id} item={i}/>)}
        </div>
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


function CouponUseCard({db,customer,commit}){
  const[code,setCode]=useState('');
  return <div className="card couponUseCard">
    <b>Kupon Kodun Var mı?</b>
    <p>Kodunu gir, damga veya ikram hakkını hesabına yükle.</p>
    <div className="couponRow">
      <input placeholder="LIBERTE20" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/>
      <button onClick={()=>{commit(applyCouponToCustomer(db,customer.id,code));setCode('');}}>Kullan</button>
    </div>
  </div>;
}

function ClubStatusCard({db,customer}){
  const l=db.loyalty[customer.id]||loyaltyTemplate(customer.id);
  const badges=customerBadges(customer,l,db);
  return <div className="card clubStatusCard">
    <div className="clubTop"><div><span>LIBERTE COIN</span><b>{calculateCoins(l)}</b></div><Crown/></div>
    <p>Rozetlerin ve coinlerin Liberte Club seviyeni güçlendirir.</p>
    <div className="badgeGrid">
      {badges.map(b=><div className="badgePill" key={b.title}><strong>{b.emoji}</strong><span>{b.title}</span><small>{b.desc}</small></div>)}
    </div>
  </div>;
}

function DailyCampaignCard({db,setTab}){
  const c=db.dailyCampaign||seed.dailyCampaign;
  if(c.active===false)return null;
  return <div className="dailyCampaignCard">
    <div className="dailyCampaignBadge">{c.emoji||'🔥'}</div>
    <div>
      <span>GÜNÜN KAMPANYASI</span>
      <h3>{c.title}</h3>
      <p>{c.body}</p>
    </div>
    <button onClick={()=>setTab&&setTab('campaign')}>Detay</button>
  </div>;
}

function DailyRewardCard({db,customer,commit}){
  const claimed=hasDailyClaim(db,customer.id,'daily_login');
  return <div className="rewardActionCard">
    <div>
      <span>GÜNLÜK GİRİŞ</span>
      <h3>Bugün uygulamaya geldin</h3>
      <p>{claimed?'Bugünün +1 damga ödülü alındı.':'Her gün giriş yap, +1 damga kazan.'}</p>
    </div>
    <button className={claimed?'ghost':'goldBtn'} onClick={()=>commit(claimDailyLoginReward(db,customer.id))}>{claimed?'Alındı':'+1 Damga'}</button>
  </div>;
}

function FirstOrderBonusCard({db,customer,commit}){
  const claimed=(db.firstOrderBonuses||[]).some(x=>x.customerId===customer.id);
  return <div className="rewardActionCard firstOrder">
    <div>
      <span>İLK SİPARİŞ</span>
      <h3>İlk alışveriş bonusu</h3>
      <p>{claimed?'Bu üyelikte ilk sipariş bonusu kullanıldı.':'İlk siparişinde +3 damga kazan.'}</p>
    </div>
    <button className={claimed?'ghost':'goldBtn'} onClick={()=>commit(claimFirstOrderBonus(db,customer.id))}>{claimed?'Kullanıldı':'+3 Damga'}</button>
  </div>;
}

function LuckyWheelCard({db,customer,commit}){
  const last=(db.wheelSpins||[]).find(x=>x.customerId===customer.id&&x.day===localDayKey());
  return <div className="luckyWheelCard">
    <div className="wheelVisual"><Sparkles/><span>🎁</span></div>
    <div>
      <span>ŞANS ÇARKI</span>
      <h3>Günde 1 kez çevir</h3>
      <p>{last?`Bugünkü ödülün: ${last.prize}`:'Damga, ikram veya sürpriz kazan.'}</p>
      <button className={last?'ghost':'goldBtn'} onClick={()=>commit(spinLuckyWheel(db,customer.id))}>{last?'Bugün çevrildi':'Şansımı Dene'}</button>
    </div>
  </div>;
}

function VipBenefitsCard({db,customer}){
  const l=db.loyalty[customer.id]||loyaltyTemplate(customer.id);
  const level=l.level||levelByStamps(l.lifetimeStamps||0);
  return <div className="card vipBenefitsCard">
    <div className="clubTop"><div><span>VIP SEVİYE</span><b>{level} Club</b></div><Crown/></div>
    <div className="vipBenefitList">
      {vipBenefits(level).map(x=><div key={x}><ShieldCheck/><span>{x}</span></div>)}
    </div>
  </div>;
}



function RewardsCenterCard({db,customer,card,commit}){
  const rewards=card?.availableRewards||0;
  const birthday=(db.history||[]).some(h=>h.customerId===customer.id&&h.type==='birthday_reward');
  const rewardName=db.settings?.reward_description||'1 Bedava İçecek';
  const rows=[
    {title:rewardName,count:rewards,desc:'Kasada QR göstererek admin tarafından kullandırılır.'},
    {title:'Doğum günü hediyesi',count:birthday?1:0,desc:'Doğum gününde hesabına tanımlanan özel ikram.'}
  ].filter(x=>x.count>0);
  return <div className="rewardsCenter card">
    <div className="centerHead">
      <div><span>ÖDÜL MERKEZİ</span><h3>Kazandığım Ödüller</h3></div>
      <Gift/>
    </div>
    {rows.length?rows.map((r,i)=><div className="rewardLine" key={i}>
      <div><b>{r.title}</b><p>{r.desc}</p></div><strong>{r.count}</strong>
    </div>):<p className="emptySmall">Henüz kullanılabilir ödülün yok. Damga biriktirmeye devam et.</p>}
  </div>;
}

function FullHistoryCard({db,customer}){
  const rows=(db.history||[]).filter(h=>h.customerId===customer.id).slice(0,30);
  const label=t=>({
    stamp_add:'Damga eklendi',stamp_remove:'Damga silindi',reward_redeem:'İkram kullanıldı',birthday_reward:'Doğum günü hediyesi',welcome_bonus:'Hoş geldin bonusu',google_review_bonus:'Google yorum bonusu',google_review_request:'Yorum onay talebi',referral_bonus:'Referans bonusu',wheel_spin:'Şans çarkı',daily_login:'Günlük giriş ödülü',first_order_bonus:'İlk sipariş bonusu',check_in:'Check-in',coupon_use:'Kupon kullanıldı',login:'Giriş yapıldı'
  }[t]||t);
  return <div className="fullHistory card">
    <div className="centerHead"><div><span>İŞLEM GEÇMİŞİ</span><h3>Damga ve Hak Hareketleri</h3></div><ShieldCheck/></div>
    {rows.length?rows.map(h=><div className="historyLine" key={h.id}>
      <div><b>{label(h.type)}</b><p>{h.createdAt} · {h.source||'Liberte Club'}</p></div>
      <strong>{h.type==='reward_redeem'?'Hak':h.count>0?`+${h.count}`:h.count||'•'}</strong>
    </div>):<p className="emptySmall">Henüz işlem geçmişi yok.</p>}
  </div>;
}

function NotificationCenterCard({db,customer}){
  const rows=(db.notifications||[]).filter(n=>!n.customerId||n.customerId===customer.id).slice(0,20);
  return <div className="notificationCenter card">
    <div className="centerHead"><div><span>BİLDİRİM MERKEZİ</span><h3>Duyurular ve Hatırlatmalar</h3></div><Bell/></div>
    {rows.length?rows.map(n=><div className="notifyLine" key={n.id}>
      <b>{n.title}</b><p>{n.body}</p><small>{n.createdAt}</small>
    </div>):<p className="emptySmall">Henüz bildirim yok.</p>}
  </div>;
}

function ReviewApprovalAdmin({db,commit}){
  const rows=(db.googleReviewRequests||[]).filter(r=>r.status==='pending');
  function approve(r){
    const createdAt=new Date().toLocaleString('tr-TR');
    let next=addStampToCustomer(db,r.customerId,3,'Admin Google yorum onayı');
    next={
      ...next,
      googleReviewRequests:(next.googleReviewRequests||db.googleReviewRequests||[]).map(x=>x.id===r.id?{...x,status:'approved',approvedAt:createdAt}:x),
      notifications:[
        {id:Date.now()+10,customerId:r.customerId,title:'Google yorum bonusun onaylandı',body:'+3 damga hesabına işlendi. Teşekkür ederiz.',createdAt},
        ...(next.notifications||[])
      ],
      history:[
        {id:Date.now()+11,customerId:r.customerId,name:r.name,phone:r.phone,type:'google_review_bonus',count:3,source:'Admin Google yorum onayı',createdAt},
        ...(next.history||[])
      ]
    };
    commit(next);
  }
  function reject(r){
    const createdAt=new Date().toLocaleString('tr-TR');
    commit({...db,googleReviewRequests:(db.googleReviewRequests||[]).map(x=>x.id===r.id?{...x,status:'rejected',rejectedAt:createdAt}:x),notifications:[{id:Date.now(),customerId:r.customerId,title:'Google yorum talebi kapatıldı',body:'Yorum bonus talebin admin tarafından kapatıldı.',createdAt},...(db.notifications||[])]});
  }
  return <div className="list">
    <div className="card"><h3>Google Yorum Onayları</h3><p>Kullanıcı yorum sayfasına yönlendikten sonra talep buraya düşer. Onaylayınca +3 damga işlenir.</p></div>
    {rows.length?rows.map(r=><div className="card reviewRequest" key={r.id}>
      <div><b>{r.name}</b><p>{r.phone} · {r.email}</p><small>{r.createdAt}</small></div>
      <div className="userActions wide"><button className="goldBtn" onClick={()=>approve(r)}><Plus/> +3 Onayla</button><button className="ghost" onClick={()=>reject(r)}>Reddet</button></div>
    </div>):<div className="empty">Bekleyen Google yorum talebi yok.</div>}
  </div>;
}

function CustomerCardsAdmin({db,commit}){
  const[first,setFirst]=useState((db.customers||[])[0]?.id||'');
  const customer=(db.customers||[]).find(c=>String(c.id)===String(first));
  const l=customer?(db.loyalty[customer.id]||loyaltyTemplate(customer.id)):null;
  if(!customer)return <div className="empty">Müşteri bulunamadı.</div>;
  const history=(db.history||[]).filter(h=>h.customerId===customer.id).slice(0,10);
  const notes=(db.customerNotes||{})[customer.id]||'';
  return <div className="customerCardAdmin">
    <div className="card">
      <h3>Müşteri Kartı</h3>
      <select value={first} onChange={e=>setFirst(e.target.value)}>{(db.customers||[]).map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select>
    </div>
    <div className="customerDetailCard">
      <div><span>ÜYE</span><h2>{customer.name}</h2><p>{customer.phone} · {customer.email||'mail yok'}</p></div>
      <div className="detailStats"><div><span>Damga</span><b>{l.totalStamps||0}</b></div><div><span>Hak</span><b>{l.availableRewards||0}</b></div><div><span>Seviye</span><b>{l.level||'Bronze'}</b></div><div><span>Coin</span><b>{calculateCoins(l)}</b></div></div>
      {notes&&<p className="customerNote big">Not: {notes}</p>}
      <div className="adminActions"><button onClick={()=>commit(addStampToCustomer(db,customer.id,1,'Müşteri kartı'))}><Plus/> Damga</button><button className="goldBtn" onClick={()=>commit(redeemRewardForCustomer(db,customer.id,'Müşteri kartı'))}><Gift/> Hak Kullan</button><button className="ghost" onClick={()=>commit(checkInCustomer(db,customer.id,'Müşteri kartı'))}><QrCode/> Check-in</button></div>
    </div>
    <div className="card"><h3>Son Hareketler</h3>{history.length?history.map(h=><div className="historyMini" key={h.id}><div><b>{h.type}</b><p>{h.createdAt} · {h.source}</p></div><strong>{h.count>0?`+${h.count}`:h.count||'•'}</strong></div>):<p className="emptySmall">Geçmiş yok.</p>}</div>
  </div>;
}

function CampaignScreen({db,customer,commit}){
  return <section className="campaignPage">
    <div className="pageHero">
      <span>LIBERTE CLUB</span>
      <h2>Kampanyalar</h2>
      <p>Üyelere özel fırsatlar ve bonus damga avantajları.</p>
    </div>

    <DailyCampaignCard db={db}/>
    <DailyRewardCard db={db} customer={customer} commit={commit}/>
    <FirstOrderBonusCard db={db} customer={customer} commit={commit}/>
    <LuckyWheelCard db={db} customer={customer} commit={commit}/>
    <VipBenefitsCard db={db} customer={customer}/>

    <ReferralCard db={db} customer={customer}/>

    <GoogleReviewBonusCard db={db} customer={customer} commit={commit} compact/>
    <RewardsCenterCard db={db} customer={customer} card={db.loyalty[customer.id]||loyaltyTemplate(customer.id)} commit={commit}/>
    <FullHistoryCard db={db} customer={customer}/>
    <NotificationCenterCard db={db} customer={customer}/>
    <CouponUseCard db={db} customer={customer} commit={commit}/>
    <ClubStatusCard db={db} customer={customer}/>

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
  const[tab,setTab]=useState('dashboard');

  return <section>
    <div className="adminHead">
      <h2>Admin Panel</h2>
      <span>{db.customers.length} müşteri</span>
    </div>

    <div className="adminTabs">
      {[
        ['dashboard','Analiz'],
        ['cards','Kart'],
        ['review','Yorum'],
        ['scan','QR'],
        ['items','Ürün'],
        ['cats','Kategori'],
        ['design','Tasarım'],
        ['push','Push'],
        ['growth','Büyüme'],
        ['club','Club'],
        ['game','V14'],
        ['users','Kullanıcı'],
        ['history','Geçmiş']
      ].map(x=>
        <button className={tab===x[0]?'on':''} onClick={()=>setTab(x[0])} key={x[0]}>
          {x[1]}
        </button>
      )}
    </div>

    {tab==='dashboard'&&<AnalyticsAdmin db={db} commit={commit}/>}
    {tab==='cards'&&<CustomerCardsAdmin db={db} commit={commit}/>}
    {tab==='review'&&<ReviewApprovalAdmin db={db} commit={commit}/>}
    {tab==='scan'&&<ScanPanel db={db} commit={commit}/>}
    {tab==='items'&&<ItemAdmin db={db} commit={commit}/>}
    {tab==='cats'&&<CategoryAdmin db={db} commit={commit}/>}
    {tab==='design'&&<DesignAdmin db={db} commit={commit}/>}
    {tab==='push'&&<PushAdmin db={db} commit={commit}/>}
    {tab==='growth'&&<GrowthAdmin db={db} commit={commit}/>}
    {tab==='club'&&<ClubAdmin db={db} commit={commit}/>}
    {tab==='game'&&<GameAdmin db={db} commit={commit}/>}
    {tab==='users'&&<UsersAdmin db={db} commit={commit}/>}
    {tab==='history'&&<HistoryAdmin db={db}/>}
  </section>;
}


function AnalyticsAdmin({db,commit}){
  const customers=db.customers||[];
  const loyalty=db.loyalty||{};
  const history=db.history||[];
  const now=new Date();
  const monthKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const totalStamps=Object.values(loyalty).reduce((a,l)=>a+(l.lifetimeStamps||0),0);
  const activeRewards=Object.values(loyalty).reduce((a,l)=>a+(l.availableRewards||0),0);
  const usedRewards=Object.values(loyalty).reduce((a,l)=>a+(l.usedRewards||0),0);
  const pushCount=(db.pushSubscriptions||[]).length;
  const monthEvents=history.filter(h=>String(h.createdAt||'').includes(monthKey)||String(h.createdAt||'').includes(now.toLocaleDateString('tr-TR').split('.').slice(1).join('.'))).length;
  const birthdayCount=customers.filter(c=>c.birthDate).length;
  const googleBonusCount=history.filter(h=>h.type==='google_review_bonus').length;
  const today=new Date().toLocaleDateString('tr-TR');
  const todayEvents=history.filter(h=>String(h.createdAt||'').startsWith(today)).length;
  const topCustomers=[...customers]
    .map(c=>({c,l:loyalty[c.id]||loyaltyTemplate(c.id)}))
    .sort((a,b)=>(b.l.lifetimeStamps||0)-(a.l.lifetimeStamps||0))
    .slice(0,5);

  function exportData(){
    const payload={customers:db.customers,loyalty:db.loyalty,history:db.history,exportedAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download='liberte-club-yedek.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return <div className="analyticsPage">
    <div className="analyticsHero card">
      <span>LIBERTE CLUB</span>
      <h3>İşletme Özeti</h3>
      <p>Damga, ikram hakkı, müşteri ve işlem hareketlerini buradan takip et.</p>
      <button className="ghost" onClick={exportData}><ShieldCheck/> Yedek İndir</button>
    </div>

    <div className="analyticsGrid">
      <div className="metricCard"><span>Toplam Üye</span><b>{customers.length}</b><small>Kayıtlı müşteri</small></div>
      <div className="metricCard"><span>Toplam Damga</span><b>{totalStamps}</b><small>Lifetime verilen</small></div>
      <div className="metricCard"><span>Aktif Hak</span><b>{activeRewards}</b><small>Kullanılabilir ikram</small></div>
      <div className="metricCard"><span>Kullanılan Hak</span><b>{usedRewards}</b><small>Kullandırılan ikram</small></div>
      <div className="metricCard"><span>Bugün İşlem</span><b>{todayEvents}</b><small>Günlük hareket</small></div>
      <div className="metricCard"><span>Push Cihaz</span><b>{pushCount}</b><small>Bildirim izni</small></div>
      <div className="metricCard"><span>Doğum Tarihi</span><b>{birthdayCount}</b><small>Profilde kayıtlı</small></div>
      <div className="metricCard"><span>Google Bonus</span><b>{googleBonusCount}</b><small>Yorum kampanyası</small></div>
    </div>

    <div className="card topMembers">
      <h3>En Sadık Üyeler</h3>
      {topCustomers.length?topCustomers.map(({c,l},i)=>
        <div className="topMember" key={c.id}>
          <span>{i+1}</span>
          <div>
            <b>{c.name}</b>
            <p>{l.level||'Bronze'} · {l.lifetimeStamps||0} toplam damga · {l.availableRewards||0} hak</p>
          </div>
        </div>
      ):<div className="empty">Henüz müşteri yok.</div>}
    </div>

    <div className="card">
      <h3>Son İşlemler</h3>
      {(history||[]).slice(0,6).map(h=>
        <div className="historyMini" key={h.id}>
          <div>
            <b>{h.name||'Müşteri'}</b>
            <p>{h.type} · {h.createdAt}</p>
          </div>
          <strong>{h.type==='reward_redeem'?'Hak':h.count>0?`+${h.count}`:h.count||'•'}</strong>
        </div>
      )}
    </div>
  </div>;
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
        <button className="ghost" onClick={()=>{commit(checkInCustomer(db,found.id,'Admin QR check-in'));setMsg('Check-in kaydedildi.')}}><QrCode/> Check-in</button>
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

function GrowthAdmin({db,commit}){
  const customers=db.customers||[];
  const referrals=db.referrals||[];
  const todayBirthdays=customers.filter(c=>isBirthdayToday(c.birthDate));
  const inactive=customers.filter(c=>!c.isAdmin&&daysSince(c.lastVisit||c.createdAt)>=7);
  const topRefs=[...customers].map(c=>({c,count:referrals.filter(r=>r.referrerId===c.id).length,code:getReferralCode(c)})).sort((a,b)=>b.count-a.count).slice(0,10);
  const[note,setNote]=useState('');

  function sendLocalCampaign(kind){
    const createdAt=new Date().toLocaleString('tr-TR');
    const title=kind==='birthday'?'Doğum günü üyeleri':'Seni özledik kampanyası';
    const body=kind==='birthday'?'Bugün doğum günü olan üyelere ikram hatırlatması.':'7 gündür gelmeyen üyeler için geri çağırma kampanyası.';
    commit({
      ...db,
      notifications:[{id:Date.now(),title,body,createdAt},...(db.notifications||[])],
      automationLog:[{id:Date.now()+1,kind,title,body,count:kind==='birthday'?todayBirthdays.length:inactive.length,createdAt},...(db.automationLog||[])]
    });
    setNote(`${title} kaydedildi. Hedef üye: ${kind==='birthday'?todayBirthdays.length:inactive.length}`);
  }

  return <div className="growthPage">
    <div className="card analyticsHero">
      <span>V12 GROWTH</span>
      <h3>Büyüme Sistemi</h3>
      <p>Referans, doğum günü ve geri çağırma kampanyalarını buradan takip et.</p>
      {note&&<p className="info">{note}</p>}
    </div>

    <div className="analyticsGrid">
      <div className="metricCard"><span>Referanslı Kayıt</span><b>{referrals.length}</b><small>Toplam davet</small></div>
      <div className="metricCard"><span>Bugün Doğum Günü</span><b>{todayBirthdays.length}</b><small>İkram hedefi</small></div>
      <div className="metricCard"><span>7+ Gün Gelmeyen</span><b>{inactive.length}</b><small>Geri çağırma</small></div>
      <div className="metricCard"><span>Push Cihaz</span><b>{(db.pushSubscriptions||[]).length}</b><small>Kayıtlı token</small></div>
    </div>

    <div className="card growthActions">
      <h3>Otomasyon Kısayolları</h3>
      <button onClick={()=>sendLocalCampaign('birthday')}><Gift/> Doğum Günü Kampanyası Kaydet</button>
      <button className="goldBtn" onClick={()=>sendLocalCampaign('inactive')}><Bell/> Seni Özledik Kampanyası Kaydet</button>
      <p>Bu kayıtlar uygulama içi bildirimlere eklenir. Gerçek push için Push sekmesinden gönderim yapabilirsin.</p>
    </div>

    <div className="card">
      <h3>Referans Liderleri</h3>
      {topRefs.map(x=><div className="historyMini" key={x.c.id}>
        <div><b>{x.c.name}</b><p>{x.code} · {x.c.phone}</p></div>
        <strong>{x.count}</strong>
      </div>)}
    </div>

    <div className="card">
      <h3>Bugün Doğum Günü Olanlar</h3>
      {todayBirthdays.length?todayBirthdays.map(c=><div className="historyMini" key={c.id}><div><b>{c.name}</b><p>{c.phone} · {c.email}</p></div><strong>🎂</strong></div>):<p className="emptySmall">Bugün doğum günü olan üye yok.</p>}
    </div>
  </div>;
}


function ClubAdmin({db,commit}){
  const[code,setCode]=useState('');
  const[title,setTitle]=useState('Bonus Damga');
  const[value,setValue]=useState(1);
  const[type,setType]=useState('stamp');

  function createCoupon(){
    const clean=String(code||'').trim().toUpperCase();
    if(clean.length<3)return alert('Kupon kodu en az 3 karakter olmalı.');
    if((db.coupons||[]).some(c=>String(c.code||'').toUpperCase()===clean))return alert('Bu kupon kodu zaten var.');
    commit({...db,coupons:[{id:Date.now(),code:clean,title,rewardType:type,rewardValue:Number(value||1),active:true,createdAt:new Date().toLocaleString('tr-TR')},...(db.coupons||[])]});
    setCode('');
  }

  function toggleCoupon(id){
    commit({...db,coupons:(db.coupons||[]).map(c=>c.id===id?{...c,active:!c.active}:c)});
  }

  return <div className="clubAdmin">
    <div className="card analyticsHero">
      <span>V13 PREMIUM CLUB</span>
      <h3>Kupon, Check-in, Rozet ve Coin</h3>
      <p>Premium üyelik mekaniklerini buradan yönet.</p>
    </div>

    <div className="analyticsGrid">
      <div className="metricCard"><span>Check-in</span><b>{(db.checkIns||[]).length}</b><small>Toplam ziyaret kaydı</small></div>
      <div className="metricCard"><span>Kupon</span><b>{(db.coupons||[]).length}</b><small>Tanımlı kod</small></div>
      <div className="metricCard"><span>Kupon Kullanımı</span><b>{(db.couponUses||[]).length}</b><small>Toplam kullanım</small></div>
      <div className="metricCard"><span>Toplam Coin</span><b>{Object.values(db.loyalty||{}).reduce((a,l)=>a+calculateCoins(l),0)}</b><small>Üye coin değeri</small></div>
    </div>

    <div className="card">
      <h3>Kupon Oluştur</h3>
      <input placeholder="Örn: LIBERTE20" value={code} onChange={e=>setCode(e.target.value)}/>
      <input placeholder="Kupon başlığı" value={title} onChange={e=>setTitle(e.target.value)}/>
      <select value={type} onChange={e=>setType(e.target.value)}>
        <option value="stamp">Damga ver</option>
        <option value="reward">İkram hakkı ver</option>
      </select>
      <input type="number" min="1" value={value} onChange={e=>setValue(e.target.value)}/>
      <button onClick={createCoupon}><Plus/> Kupon Oluştur</button>
    </div>

    <div className="card">
      <h3>Kuponlar</h3>
      {(db.coupons||[]).map(c=><div className="historyMini" key={c.id}>
        <div><b>{c.code}</b><p>{c.title} · {c.rewardType==='reward'?'İkram':'Damga'} +{c.rewardValue}</p></div>
        <button className={c.active?'ghost':'danger'} onClick={()=>toggleCoupon(c.id)}>{c.active?'Aktif':'Pasif'}</button>
      </div>)}
    </div>

    <div className="card">
      <h3>Son Check-inler</h3>
      {(db.checkIns||[]).slice(0,10).map(x=><div className="historyMini" key={x.id}><div><b>{x.name}</b><p>{x.date} · {x.phone}</p></div><strong>QR</strong></div>)}
    </div>
  </div>;
}

function GameAdmin({db,commit}){
  const c=db.dailyCampaign||seed.dailyCampaign;
  const[form,setForm]=useState({title:c.title||'',body:c.body||'',emoji:c.emoji||'🔥',active:c.active!==false});
  const[prizes,setPrizes]=useState(db.wheelPrizes||seed.wheelPrizes);

  function saveCampaign(){
    commit({...db,dailyCampaign:{...c,...form,updatedAt:new Date().toLocaleString('tr-TR')}});
  }

  function savePrizes(){
    commit({...db,wheelPrizes:prizes.map((p,i)=>({...p,id:p.id||Date.now()+i,weight:Number(p.weight||1),value:Number(p.value||0)}))});
  }

  return <div className="gameAdmin">
    <div className="card analyticsHero">
      <span>V14 OYUNLAŞTIRMA</span>
      <h3>Günün kampanyası, şans çarkı ve bonuslar</h3>
      <p>Müşteriyi uygulamaya geri getiren gelir artırıcı sistemleri buradan yönet.</p>
    </div>

    <div className="analyticsGrid">
      <div className="metricCard"><span>Günlük Ödül</span><b>{(db.dailyClaims||[]).length}</b><small>Toplam giriş ödülü</small></div>
      <div className="metricCard"><span>Çark</span><b>{(db.wheelSpins||[]).length}</b><small>Toplam çevirme</small></div>
      <div className="metricCard"><span>İlk Sipariş</span><b>{(db.firstOrderBonuses||[]).length}</b><small>Bonus kullanılan</small></div>
      <div className="metricCard"><span>Aktif Kampanya</span><b>{form.active?'Açık':'Kapalı'}</b><small>Günün kampanyası</small></div>
    </div>

    <div className="card">
      <h3>Günün Kampanyası</h3>
      <label>Emoji</label>
      <input value={form.emoji} onChange={e=>setForm({...form,emoji:e.target.value})}/>
      <label>Başlık</label>
      <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
      <label>Açıklama</label>
      <textarea value={form.body} onChange={e=>setForm({...form,body:e.target.value})}/>
      <label className="adminToggle"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/><span>Kampanya aktif</span></label>
      <button onClick={saveCampaign}><ShieldCheck/> Kampanyayı Kaydet</button>
    </div>

    <div className="card">
      <h3>Şans Çarkı Ödülleri</h3>
      {prizes.map((p,i)=><div className="prizeEdit" key={p.id||i}>
        <input value={p.label} onChange={e=>setPrizes(prizes.map((x,n)=>n===i?{...x,label:e.target.value}:x))}/>
        <select value={p.type} onChange={e=>setPrizes(prizes.map((x,n)=>n===i?{...x,type:e.target.value}:x))}>
          <option value="stamp">Damga</option>
          <option value="reward">İkram</option>
          <option value="message">Mesaj</option>
        </select>
        <input type="number" value={p.value} onChange={e=>setPrizes(prizes.map((x,n)=>n===i?{...x,value:e.target.value}:x))}/>
        <input type="number" value={p.weight} onChange={e=>setPrizes(prizes.map((x,n)=>n===i?{...x,weight:e.target.value}:x))}/>
      </div>)}
      <button className="ghost" onClick={()=>setPrizes([...prizes,{id:Date.now(),label:'+1 Damga',type:'stamp',value:1,weight:10}])}><Plus/> Ödül Ekle</button>
      <button onClick={savePrizes}><ShieldCheck/> Çarkı Kaydet</button>
    </div>

    <div className="card">
      <h3>Son V14 Hareketleri</h3>
      {[...(db.wheelSpins||[]),...(db.dailyClaims||[]),...(db.firstOrderBonuses||[])].slice(0,12).map(x=><div className="historyMini" key={`${x.id}-${x.type||'bonus'}`}><div><b>{x.name}</b><p>{x.prize||x.type||'İlk sipariş bonusu'} · {x.createdAt}</p></div><strong>{x.day||'V14'}</strong></div>)}
    </div>
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
        setBody('7 gündür görüşemedik. Bugün Liberte’ye gel, ekstra damga kazan.');
      }}>Seni özledik</button>

      <button onClick={()=>{
        setTitle('Doğum günün kutlu olsun 🎂');
        setBody('Liberte’den doğum gününe özel 1 içecek ikramın hesabında.');
      }}>Doğum Günü</button>
    </div>

    <button onClick={send}><Send/> Gönder</button>

    {note&&<p className="info">{note}</p>}

    <h4>Kayıtlı cihazlar: {(db.pushSubscriptions||[]).length}</h4>
  </div>;
}

function UsersAdmin({db,commit}){
  const[editing,setEditing]=useState(null);
  const[form,setForm]=useState({name:'',phone:'',email:'',birthDate:'',isAdmin:false,note:''});
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
      isAdmin:!!c.isAdmin,
      note:(db.customerNotes||{})[c.id]||''
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
      customerNotes:{...(db.customerNotes||{}),[c.id]:form.note||''},
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
            <p>Referans kodu: <b>{getReferralCode(c)}</b></p>
            <small>{l.totalStamps||0} damga · {l.availableRewards||0} kullanılabilir hak · {l.usedRewards||0} kullanılan · lifetime {l.lifetimeStamps||0}</small>
            {(db.customerNotes||{})[c.id]&&<p className="customerNote">Not: {(db.customerNotes||{})[c.id]}</p>}
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

            <label>Müşteri Notu</label>
            <textarea value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Örn: Şekersiz latte seviyor"/>

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
    referral_bonus:'Referans bonusu',
    login:'Giriş yapıldı',
    google_review_bonus:'Google yorum bonusu',
    customer_edit:'Kullanıcı düzenlendi',
    customer_delete:'Kullanıcı silindi',
    check_in:'Check-in',
    coupon_use:'Kupon kullanıldı',
    wheel_spin:'Şans çarkı',
    daily_login:'Günlük giriş ödülü',
    first_order_bonus:'İlk sipariş bonusu',
    login:'Giriş yapıldı'
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
