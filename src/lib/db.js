export const seed={
  settings:{
    stamp_threshold:10,
    reward_description:'1 Bedava İçecek',
    cafe_name:'Liberte Gastro Cafe',
    app_name:'Liberte Club',
    bg:'#f7fbf8',
    card:'#ffffff',
    accent:'#78dfbb',
    font:'Inter',
    logo:'/liberte-logo.png?v=4',
    hero_title:'Bugünün Favorileri',
    hero_subtitle:'Kahve, tatlı ve burger keyfi Liberte’de.',
    promo_text:'QR kartını göster, 10 damgada 1 içecek bizden.',
    cashier_pin:'5454',
    review_popup:true,
    daily_popup:true,
    wheel_unlimited:false
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
  pushLog:[],
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

export function mergeDb(x){
  return x?{
    ...seed,
    ...x,
    settings:{...seed.settings,...x.settings,logo:x.settings?.logo||seed.settings.logo},
    customers:x.customers||seed.customers,
    loyalty:x.loyalty||seed.loyalty,
    categories:x.categories||seed.categories,
    items:x.items||seed.items,
    notifications:x.notifications||seed.notifications,
    history:x.history||[],
    feedback:x.feedback||[],
    pushSubscriptions:x.pushSubscriptions||[],
    pushLog:x.pushLog||[],
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

export function load(){
  try{
    return mergeDb(JSON.parse(localStorage.getItem('liberteDB')||'null'));
  }catch{
    return seed;
  }
}

export function save(db){
  localStorage.setItem('liberteDB',JSON.stringify(db));
}

export async function loadRemote(){
  try{
    const r=await fetch('/api/state');
    if(!r.ok)return null;
    const j=await r.json();
    if(!j?.data)return null;
    return{data:mergeDb(j.data),updatedAt:j.updated_at||null};
  }catch{
    return null;
  }
}

export async function saveRemote(db){
  try{
    await fetch('/api/state',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({data:db})
    });
  }catch{}
}

export const norm=p=>{
  let digits=String(p||'').replace(/\D/g,'');
  if(digits.startsWith('90')&&digits.length>10) digits=digits.slice(2);
  if(digits.startsWith('0')&&digits.length>10) digits=digits.slice(1);
  if(digits.length>10) digits=digits.slice(-10);
  return digits;
};
export const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(n||0));
export const cssVars=s=>({'--bg':s.bg,'--card':s.card,'--accent':s.accent,fontFamily:`${s.font},Inter,system-ui,Arial`});
export const levelByStamps=n=>n>=90?'Black':n>=50?'Gold':n>=20?'Silver':'Bronze';
export const todayKey=()=>new Date().toISOString().slice(0,10);
export const birthdayKey=()=>{
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
export function getGreeting(){
  const d=new Date();
  const h=d.getHours();
  const time=d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
  if(h>=5&&h<12)return{label:'Günaydın',emoji:'☀️',time,tone:'Sabah kahvesi zamanı'};
  if(h>=12&&h<17)return{label:'İyi günler',emoji:'☕',time,tone:'Günün en güzel molası'};
  if(h>=17&&h<22)return{label:'İyi akşamlar',emoji:'🌙',time,tone:'Akşam keyfi Liberte’de'};
  return{label:'İyi geceler',emoji:'✨',time,tone:'Geceye tatlı bir mola'};
}
export function isBirthdayToday(birthDate){
  if(!birthDate)return false;
  const parts=String(birthDate).split('-');
  if(parts.length<3)return false;
  const d=new Date();
  return Number(parts[1])===d.getMonth()+1&&Number(parts[2])===d.getDate();
}

export function makeReferralCode(name='',phone='',id=''){
  const base=String(name||'LIBERTE')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9]/g,'')
    .toUpperCase()
    .slice(0,6)||'LIBERTE';
  const tail=String(phone||id||Date.now()).replace(/\D/g,'').slice(-4)||String(id).slice(-4);
  return `${base}${tail}`;
}

export function getReferralCode(customer){
  return customer?.referralCode||makeReferralCode(customer?.name,customer?.phone,customer?.id);
}

export function findReferrerByCode(db,code){
  const clean=String(code||'').trim().toUpperCase().replace(/\s/g,'');
  if(!clean)return null;
  return (db.customers||[]).find(c=>getReferralCode(c)===clean)||null;
}

export function daysSince(dateText){
  if(!dateText)return 999;
  const d=new Date(dateText);
  if(Number.isNaN(d.getTime()))return 999;
  return Math.floor((Date.now()-d.getTime())/(1000*60*60*24));
}


export function localDayKey(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Admin veya ayar açıksa çark sınırı yok
export function isWheelUnlimited(db,customer){
  return Boolean(customer?.isAdmin)||db.settings?.wheel_unlimited===true;
}

export function hasDailyClaim(db,customerId,type){
  const day=localDayKey();
  return (db.dailyClaims||[]).some(x=>x.customerId===customerId&&x.type===type&&x.day===day);
}

// Ardışık günlük giriş serisini hesaplar
export function getCustomerStreak(db,customerId){
  const days=new Set(
    (db.dailyClaims||[])
      .filter(x=>x.customerId===customerId&&x.type==='daily_login')
      .map(x=>x.day)
  );
  if(!days.size)return 0;
  let streak=0;
  const cursor=new Date();
  const today=localDayKey();
  if(!days.has(today))cursor.setDate(cursor.getDate()-1);
  while(true){
    const key=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`;
    if(!days.has(key))break;
    streak++;
    cursor.setDate(cursor.getDate()-1);
  }
  return streak;
}

// Ana sayfa günlük görev listesini üretir
export function getDailyTasks(db,customerId){
  const day=localDayKey();
  const threshold=db.settings?.stamp_threshold||10;
  const card=db.loyalty[customerId]||loyaltyTemplate(customerId);
  const stamps=card.totalStamps||0;
  const dailyDone=hasDailyClaim(db,customerId,'daily_login');
  const wheelDone=(db.wheelSpins||[]).some(x=>x.customerId===customerId&&x.day===day);
  const firstDone=(db.firstOrderBonuses||[]).some(x=>x.customerId===customerId);
  return[
    {id:'daily',label:'Günlük ödül',desc:dailyDone?'Alındı ✓':'+1 damga al',done:dailyDone,tab:'wheel',icon:'sun'},
    {id:'wheel',label:'Şans çarkı',desc:wheelDone?'Bugün çevrildi':'Günde 1 çevir',done:wheelDone,tab:'wheel',icon:'sparkles'},
    {id:'stamps',label:'Damga hedefi',desc:`${stamps}/${threshold} damga`,done:stamps>=threshold,tab:'qr',icon:'coffee',progress:Math.min(100,(stamps/threshold)*100)},
    {id:'first',label:'İlk sipariş',desc:firstDone?'Kullanıldı':'+3 damga bonus',done:firstDone,tab:'wheel',icon:'gift'}
  ];
}

export function claimDailyLoginReward(db,customerId){
  const customer=db.customers.find(c=>c.id===customerId);
  if(!customer)return db;
  const day=localDayKey();
  if(hasDailyClaim(db,customerId,'daily_login')){alert('Günlük giriş ödülünü bugün zaten aldın.');return db;}
  const createdAt=new Date().toLocaleString('tr-TR');
  const prevStreak=getCustomerStreak(db,customerId);
  let next=addStampToCustomer(db,customerId,1,'Günlük giriş ödülü');
  next={...next,dailyClaims:[{id:Date.now(),customerId,name:customer.name,phone:customer.phone,type:'daily_login',day,createdAt},...(next.dailyClaims||[])]};
  const newStreak=prevStreak+1;
  if(newStreak===3)next=addStampToCustomer(next,customerId,1,'3 gün seri bonusu');
  if(newStreak===7)next=addStampToCustomer(next,customerId,2,'7 gün seri bonusu');
  return next;
}

export function claimFirstOrderBonus(db,customerId){
  const customer=db.customers.find(c=>c.id===customerId);
  if(!customer)return db;
  if((db.firstOrderBonuses||[]).some(x=>x.customerId===customerId)){alert('İlk alışveriş bonusu bu üyelikte daha önce kullanıldı.');return db;}
  const createdAt=new Date().toLocaleString('tr-TR');
  let next=addStampToCustomer(db,customerId,3,'İlk alışveriş bonusu');
  return{...next,firstOrderBonuses:[{id:Date.now(),customerId,name:customer.name,phone:customer.phone,createdAt},...(next.firstOrderBonuses||[])]};
}

export function weightedPrize(prizes=[]){
  const list=prizes.length?prizes:seed.wheelPrizes;
  const total=list.reduce((a,p)=>a+Number(p.weight||1),0);
  let r=Math.random()*total;
  for(const p of list){
    r-=Number(p.weight||1);
    if(r<=0)return p;
  }
  return list[0];
}

// Önceden seçilen ödülü veritabanına işler (animasyon sonrası kullanılır)
export function applyWheelPrize(db,customerId,prize){
  const customer=db.customers.find(c=>c.id===customerId);
  if(!customer||!prize)return db;
  const day=localDayKey();
  if((db.wheelSpins||[]).some(x=>x.customerId===customerId&&x.day===day))return db;
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

export function spinLuckyWheel(db,customerId){
  const customer=db.customers.find(c=>c.id===customerId);
  if(!customer)return db;
  const day=localDayKey();
  if((db.wheelSpins||[]).some(x=>x.customerId===customerId&&x.day===day)){alert('Şans çarkını bugün zaten çevirdin.');return db;}
  return applyWheelPrize(db,customerId,weightedPrize(db.wheelPrizes));
}

export function vipBenefits(level='Bronze'){
  const map={
    Bronze:['Damga toplama','Google yorum bonusu','Günlük giriş ödülü'],
    Silver:['Bronze avantajları','Ayda özel kampanya','Doğum günü önceliği'],
    Gold:['Silver avantajları','VIP kampanya erişimi','Haftalık şans çarkı bonusları'],
    Black:['Gold avantajları','Özel ikram günleri','Premium Club ayrıcalıkları']
  };
  return map[level]||map.Bronze;
}


export function productImageSrc(item){
  const direct=String(item?.imageUrl||'').trim();
  if(direct)return direct;
  const img=String(item?.image||'').trim();
  if(/^https?:\/\//i.test(img)||img.startsWith('data:image/'))return img;
  return '';
}

export function fileToDataUrl(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=rej;
    r.readAsDataURL(file);
  });
}

export function loyaltyTemplate(id){
  return{
    customerId:id,
    totalStamps:0,
    availableRewards:0,
    usedRewards:0,
    lifetimeStamps:0,
    level:'Bronze'
  };
}

export function addStampToCustomer(db,id,count=1,source='Admin'){
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


export function calculateCoins(l){
  return Math.max(0,Math.floor((l?.lifetimeStamps||0)*10 + (l?.usedRewards||0)*50));
}

export function customerBadges(customer,loyalty,db){
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

export function checkInCustomer(db,customerId,source='QR Check-in'){
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

export function applyCouponToCustomer(db,customerId,rawCode){
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

export function redeemRewardForCustomer(db,id,source='Admin'){
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

export function applyBirthdayReward(db,id){
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
