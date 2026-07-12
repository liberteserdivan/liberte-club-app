import{
  STAMP_CATEGORIES,
  STAMP_SLOT_COUNT,
  emptyCategoryStamps,
  emptyCategoryRewards,
  normalizeCategoryStamps,
  normalizeCategoryRewards,
  stampCardProgress,
  stampsRemaining,
  getLpBalance,
  getRedeemableRewards,
  canRedeemLpReward,
  getLpLifetime,
  lpRewardStatusText
} from './loyaltyStamps.js';
import {
  migrateLoyaltyCard,
  migrateAllLoyalty,
  getCategoryLpGain,
  getCategoryRewardCost,
  LP_HISTORY_EARN,
  LP_HISTORY_REDEEM,
  levelByLp,
  pickLoyaltyCard
} from './loyaltyPoints.js';
import {
  canUseMonthlyDiscount,
  currentMonthKey,
  getMembershipView,
  getTierDiscountPercent,
  isBirthdayCoffeeUsed,
  tierBenefits,
  UNIVERSAL_MEMBERSHIP_BENEFITS,
  TIER_DISCOUNT_RULES
} from './membershipTier.js';
import { apiJson, SYNC_REQUEST_OPTIONS } from './apiClient.js';
import { dedupedApiJson } from './remoteFetch.js';
import { formatClientApiError } from './apiErrors.js';
import { isLocalAuth } from './devAuth.js';
import { MENU_REVISION, menuCategories, menuItems } from './menuSeed.js';
import { legacyReferralCode, generateUniqueReferralCode } from './referralCode.js';
import {
  STORE_APP_NAME,
  CLUB_APP_NAME,
  BRAND_SLOGAN,
  LOYALTY_PROMO
} from './constants.js';
import {
  assertMenuItemCanEarnLp,
  requiresProductPickForLpCategory
} from './menuLp.js';

export { generateUniqueReferralCode } from './referralCode.js';

// Güncel menü seed'i mi kullanılacak?
function resolveMenu(x) {
  const revision = Number(x?.menuRevision || 0);
  if (revision >= MENU_REVISION) {
    return {
      menuRevision: revision,
      categories: x.categories || menuCategories,
      items: x.items || menuItems
    };
  }
  return {
    menuRevision: MENU_REVISION,
    categories: menuCategories,
    items: menuItems
  };
}

export const seed={
  settings:{
    stamp_threshold:7,
    reward_description:'Kategori ikramı',
    cafe_name: STORE_APP_NAME,
    app_name: CLUB_APP_NAME,
    bg:'#f7fbf8',
    card:'#ffffff',
    accent:'#78dfbb',
    font:'Inter',
    logo:'/liberte-logo-source.png?v=11',
    hero_title:'Bugünün Favorileri',
    hero_subtitle: BRAND_SLOGAN,
    promo_text: `${BRAND_SLOGAN} ${LOYALTY_PROMO}`,
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
    },
    {
      id:900001,
      phone:'5550100001',
      name:'Demo Müşteri',
      email:'demo.customer@liberte.cafe',
      isAdmin:false,
      createdAt:new Date().toLocaleString('tr-TR'),
      lastVisit:null,
      birthDate:''
    },
    {
      id:900002,
      phone:'5550100002',
      name:'Demo Yönetici',
      email:'demo.admin@liberte.cafe',
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
      categoryStamps:emptyCategoryStamps(),
      categoryRewards:emptyCategoryRewards(),
      availableRewards:0,
      usedRewards:0,
      lifetimeStamps:0,
      level:'Bronze'
    },
    900001:{
      customerId:900001,
      totalStamps:2,
      categoryStamps:{coffee:2,dessert:0,burger:0},
      categoryRewards:emptyCategoryRewards(),
      availableRewards:0,
      usedRewards:0,
      lifetimeStamps:2,
      level:'Bronze'
    },
    900002:{
      customerId:900002,
      totalStamps:0,
      categoryStamps:emptyCategoryStamps(),
      categoryRewards:emptyCategoryRewards(),
      availableRewards:0,
      usedRewards:0,
      lifetimeStamps:0,
      level:'Bronze'
    }
  },
  menuRevision:MENU_REVISION,
  categories:menuCategories,
  items:menuItems,
  notifications:[
    {id:1,title:'Liberte Club Açıldı',body:'QR kartını göster, Liberte Puan biriktirmeye başla.',createdAt:new Date().toLocaleString('tr-TR')}
  ],
  history:[],
  feedback:[],
  pushSubscriptions:[],
  pushLog:[],
  referrals:[],
  automationLog:[],
  checkIns:[],
  coupons:[{id:1,code:'LIBERTE10',title:'Hoş Geldin Kuponu',rewardType:'stamp',rewardValue:2,active:true,createdAt:new Date().toLocaleString('tr-TR')}],
  couponUses:[],
  dailyClaims:[],
  wheelSpins:[],
  firstOrderBonuses:[],
  customerNotes:{},
  dailyCampaign:{id:1,title:'Bugünün Kampanyası',body:'2 Latte alana +1 bonus LP',active:true,rewardType:'stamp',rewardValue:1,emoji:'☕'},
  wheelPrizes:[
    {id:1,label:'+1 LP',type:'stamp',value:1,weight:35},
    {id:2,label:'+2 LP',type:'stamp',value:2,weight:18},
    {id:3,label:'+7 LP İkram',type:'reward',value:1,weight:6},
    {id:4,label:'Tatlı Molası',type:'message',value:0,weight:8},
    {id:5,label:'Bugün Şanslı Gün',type:'stamp',value:3,weight:3},
    {id:6,label:'Tekrar Dene',type:'message',value:0,weight:30}
  ],
  campaigns:[
    {id:1,title:'Bugüne Özel',body:'Smash Menü + kahve fırsatını kaçırma.',active:true,emoji:'🔥'}
  ]
};

export function mergeDb(x){
  const menu = resolveMenu(x);
  let customers = x?.customers || seed.customers;

  // Dev — seed yönetici/demo hesapları silinmişse geri ekle
  if (isLocalAuth() && Array.isArray(customers)) {
    customers = [...customers];
    seed.customers.forEach((seedCustomer) => {
      const exists = customers.some((c) => norm(c.phone) === norm(seedCustomer.phone));
      if (!exists) customers.push(seedCustomer);
    });
  }

  return x?{
    ...seed,
    ...x,
    ...menu,
    settings:{...seed.settings,...x.settings,logo:x.settings?.logo||seed.settings.logo},
    customers,
    loyalty:migrateAllLoyalty(x.loyalty||seed.loyalty),
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

// Auth yanıtından müşteriyi yerel db'ye yaz — /api/state beklemeden ana ekran
export function mergeAuthSnapshot(db, { customer, loyalty } = {}) {
  if (!customer?.id) return mergeDb(db);
  const base = mergeDb(db);
  const customers = [...(base.customers || [])];
  const index = customers.findIndex((row) => Number(row.id) === Number(customer.id));
  if (index >= 0) {
    customers[index] = { ...customers[index], ...customer };
  } else {
    customers.push(customer);
  }

  const loyaltyMap = { ...(base.loyalty || {}) };
  if (loyalty) {
    loyaltyMap[customer.id] = migrateLoyaltyCard(loyalty);
  }

  return {
    ...base,
    customers,
    loyalty: loyaltyMap
  };
}

// Bozuk yerel önbelleği güvenle ayıkla
function parseLocalCache(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

// Yerel veri önbelleği anahtarı
const LOCAL_DB_KEY = 'liberteDB';
// Açılışta çok büyük bir önbelleği senkron JSON.parse etmek ilk render'ı bloklar.
// Bu sınırı aşan (bozuk/şişmiş) cache açılışta atılır; uygulama seed ile açılıp
// güncel veriyi uzaktan çeker.
const LOCAL_DB_MAX_CHARS = 2_000_000; // ~2MB

export function load(){
  try{
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (!raw) return seed;
    if (raw.length > LOCAL_DB_MAX_CHARS) {
      // Şişmiş/bozuk önbellek ilk render'ı kilitlemesin
      localStorage.removeItem(LOCAL_DB_KEY);
      return seed;
    }
    const parsed = parseLocalCache(JSON.parse(raw));
    if (!parsed) {
      localStorage.removeItem(LOCAL_DB_KEY);
      return seed;
    }
    return mergeDb(parsed);
  }catch{
    try {
      localStorage.removeItem(LOCAL_DB_KEY);
    } catch {
      // private mode
    }
    return seed;
  }
}

export function save(db){
  try {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  } catch {
    // kota veya gizli mod — uygulama çalışmaya devam etsin
  }
}

// Yerel veri önbelleğini sil — çıkışta müşteri/loyalty/history PII cihazda kalmasın.
// liberteLastPhone / liberteLastEmail / liberteDeviceId ayrı anahtarlardır, korunur.
export function clearLocalDb(){
  try {
    localStorage.removeItem(LOCAL_DB_KEY);
  } catch {
    // gizli mod / kota — yoksay
  }
}

export async function loadRemote(options = {}){
  if(isLocalAuth())return null;
  const since = String(options.since || '').trim();
  const path = since ? `/api/state?since=${encodeURIComponent(since)}` : '/api/state';

  try{
    const {response,data:j}=await dedupedApiJson(path, { skipUnauthorized: true });
    if(response.status === 401){
      return { unauthorized: true };
    }
    // Geçici sunucu/DB sorunu — önbellekteki veri kullanılmaya devam eder
    if(response.status === 503){
      return {
        network: true,
        transient: true,
        status: 503,
        code: j?.code || 'STATE_TEMPORARILY_UNAVAILABLE',
        error: j?.error || 'Veriler şu an alınamıyor. Biraz sonra tekrar dene.'
      };
    }
    if(!response.ok){
      return { network: response.status >= 500 || response.status === 0, status: response.status };
    }
    if(j?.unchanged){
      return{
        unchanged:true,
        data:null,
        updatedAt:j.updated_at||since||null,
        role:j.role||'user',
        isAdmin:Boolean(j.isAdmin),
        adminVerified:Boolean(j.adminVerified)
      };
    }
    if(!j?.data)return null;
    return{
      data:mergeDb(j.data),
      updatedAt:j.updated_at||null,
      role:j.role||'user',
      isAdmin:Boolean(j.isAdmin),
      adminVerified:Boolean(j.adminVerified)
    };
  }catch(error){
    return {
      network: true,
      error: error?.message || 'Sunucuya bağlanılamadı.'
    };
  }
}

// Buluta kaydet — sonuç döndürür (sessiz hata yok)
export async function saveRemote(db, options = {}){
  if(isLocalAuth())return { ok:true, skipped:true };

  const payload = { data: db };
  const baseUpdatedAt = String(options.baseUpdatedAt || '').trim();
  if (baseUpdatedAt) payload.updated_at = baseUpdatedAt;

  try{
    const {response,data}=await dedupedApiJson('/api/state',{
      method:'POST',
      body:JSON.stringify(payload),
      skipUnauthorized: true
    });

    if(response.status === 409){
      return {
        ok:false,
        conflict:true,
        status:409,
        updatedAt:data?.updated_at||null,
        error:data?.error||'Veri başka bir oturumda güncellendi.'
      };
    }

    if(!response.ok){
      return {
        ok:false,
        status:response.status,
        error:data?.clientMessage||data?.message||data?.error||'Veriler sunucuya kaydedilemedi.',
        requestId:data?.requestId||null,
        fields:data?.fields||null
      };
    }

    return {
      ok:true,
      updatedAt:data?.updated_at||null,
      requestId:data?.requestId||null
    };
  }catch(error){
    const formatted = formatClientApiError({ error, fallback: 'Sunucuya ulaşılamadı.' });
    return {
      ok:false,
      network:true,
      code:error?.code||'NETWORK_ERROR',
      error:formatted.message||error?.message||'Sunucuya ulaşılamadı.',
      requestId:null
    };
  }
}

// Müşteri kimliği karşılaştırması — string/number uyumu
export function sameCustomerId(a, b) {
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

export const norm=(p)=>{
  let digits=String(p||'').replace(/\D/g,'');
  if(!digits) return '';
  if(digits.startsWith('90')&&digits.length>=12) digits=digits.slice(2);
  if(digits.startsWith('0')) digits=digits.slice(1);
  if(digits.length>10) digits=digits.slice(-10);
  return digits;
};
export const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(n||0));
export const cssVars=s=>({'--bg':s.bg,'--card':s.card,'--accent':s.accent,fontFamily:`${s.font},Inter,system-ui,Arial`});
export const levelByStamps=(n)=>levelByLp(n);
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

export function makeReferralCode(_name = '', _phone = '', _id = '', customers = []) {
  return generateUniqueReferralCode(customers);
}

export function getReferralCode(customer) {
  if (customer?.referralCode) return String(customer.referralCode).toUpperCase();
  return legacyReferralCode(customer);
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
  // Gün anahtarı — Türkiye saatine sabit (sunucu ile uyumlu, en-CA: YYYY-MM-DD)
  try{
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }catch{
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
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
  const card=migrateLoyaltyCard(db.loyalty[customerId]||loyaltyTemplate(customerId));
  const lpBalance=getLpBalance(card);
  const redeemable=getRedeemableRewards(card);
  const { remaining } = (() => {
    const sorted=[...STAMP_CATEGORIES].sort((a,b)=>a.rewardCost-b.rewardCost);
    for (const tier of sorted) {
      if (lpBalance < tier.rewardCost) return { remaining: tier.rewardCost - lpBalance };
    }
    return { remaining: 0 };
  })();
  return[
    {id:'lp',label:'Liberte Puan',desc:remaining===0?'Ödül kullanıma hazır!':`Sonraki ödüle ${remaining} LP`,done:remaining===0,tab:'qr',icon:'coffee',progress:stampCardProgress(card)},
    {id:'rewards',label:'Kazanılabilir ödüller',desc:redeemable.length?`${redeemable.length} ödül kullanılabilir`:'Henüz yeterli LP yok',done:redeemable.length>0,tab:'qr',icon:'gift'}
  ];
}

export function claimDailyLoginReward(db,customerId){
  const customer=db.customers.find(c=>c.id===customerId);
  if(!customer)return { ok:false, db, message:'Üye bulunamadı.' };
  const day=localDayKey();
  if(hasDailyClaim(db,customerId,'daily_login')){
    return { ok:false, db, message:'Günlük giriş ödülünü bugün zaten aldın.' };
  }
  const createdAt=new Date().toLocaleString('tr-TR');
  const prevStreak=getCustomerStreak(db,customerId);
  let next=addStampToCustomer(db,customerId,1,'Günlük giriş ödülü');
  next={...next,dailyClaims:[{id:Date.now(),customerId,name:customer.name,phone:customer.phone,type:'daily_login',day,createdAt},...(next.dailyClaims||[])]};
  const newStreak=prevStreak+1;
  if(newStreak===3)next=addStampToCustomer(next,customerId,1,'3 gün seri bonusu');
  if(newStreak===7)next=addStampToCustomer(next,customerId,2,'7 gün seri bonusu');
  const bonusNote=newStreak===3?' 3 gün seri bonusu da eklendi!':newStreak===7?' 7 gün seri bonusu da eklendi!':'';
  return { ok:true, db:next, message:`+1 LP günlük giriş ödülü hesabına eklendi.${bonusNote}` };
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
  if(prize.type==='stamp'||prize.type==='lp')next=addCategoryStampToCustomer(next,customerId,'coffee',Number(prize.value||1),'Şans çarkı');
  if(prize.type==='reward'){
    const current=migrateLoyaltyCard(next.loyalty[customerId]||loyaltyTemplate(customerId));
    const bonus=Number(prize.value||1)*7;
    next={...next,loyalty:{...next.loyalty,[customerId]:{...current,lpBalance:(current.lpBalance||0)+bonus,lpLifetime:(current.lpLifetime||0)+bonus,level:levelByLp((current.lpLifetime||0)+bonus),updatedAt:createdAt}}};
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

export function vipBenefits(level = 'Bronze') {
  return tierBenefits(level);
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
  return migrateLoyaltyCard({
    customerId:id,
    schemaVersion:2,
    lpBalance:0,
    lpLifetime:0,
    usedRewards:0,
    level:'Bronze',
    categoryStamps:emptyCategoryStamps(),
    categoryRewards:emptyCategoryRewards(),
    totalStamps:0,
    availableRewards:0,
    lifetimeStamps:0
  });
}

// Kategori işlemine göre LP ekler veya çıkarır
export function addCategoryStampToCustomer(db, id, category, count = 1, source = 'Admin', menuItem = null) {
  const customer = db.customers.find((c) => c.id === id);
  if (!customer) return db;

  const steps = Math.abs(Math.trunc(count));
  if (!steps) return db;

  const sign = count >= 0 ? 1 : -1;

  if (sign > 0) {
    if (menuItem) {
      const check = assertMenuItemCanEarnLp(menuItem);
      if (!check.ok) {
        if (typeof globalThis.alert === 'function') globalThis.alert(check.error);
        return db;
      }
      category = check.category;
    } else if (requiresProductPickForLpCategory(category, db.items || [])) {
      if (typeof globalThis.alert === 'function') {
        globalThis.alert('Bu kategori için ürün seçimi gerekli.');
      }
      return db;
    }
  }

  const valid = STAMP_CATEGORIES.some((cat) => cat.id === category);
  if (!valid) return db;
  const lpGain=getCategoryLpGain(category)*steps;
  const current=migrateLoyaltyCard(db.loyalty[id]||loyaltyTemplate(id));
  const oldBalance=current.lpBalance||0;
  const oldLifetime=current.lpLifetime||0;

  if(sign<0&&oldBalance<lpGain){
    if(typeof globalThis.alert==='function') alert('Yetersiz LP');
    return db;
  }

  const earnType = LP_HISTORY_EARN[category] || 'lp_add';
  const nextBalance=Math.max(0, sign>0?oldBalance+lpGain:oldBalance-lpGain);
  const nextLifetime=sign>0?oldLifetime+lpGain:oldLifetime;
  const createdAt=new Date().toLocaleString('tr-TR');
  const catLabel=STAMP_CATEGORIES.find(cat=>cat.id===category)?.label||category;

  return{
    ...db,
    loyalty:{
      ...db.loyalty,
      [id]:{
        ...current,
        lpBalance:nextBalance,
        lpLifetime:nextLifetime,
        level:levelByLp(nextLifetime),
        updatedAt:createdAt
      }
    },
    history:[
      {
        id:Date.now(),
        customerId:id,
        name:customer.name,
        phone:customer.phone,
        type:sign>0?earnType:'lp_remove',
        count:lpGain,
        category,
        categoryLabel:catLabel,
        menuItemId: menuItem?.id || null,
        menuItemName: menuItem?.name || null,
        lpBefore:oldBalance,
        lpAfter:nextBalance,
        before:{lpBalance:oldBalance,lpLifetime:oldLifetime},
        after:{lpBalance:nextBalance,lpLifetime:nextLifetime},
        source,
        createdAt
      },
      ...(db.history||[])
    ]
  };
}

export function addStampToCustomer(db,id,count=1,source='Admin'){
  return addCategoryStampToCustomer(db,id,'coffee',count,source);
}


export function calculateCoins(l){
  // Geri uyumluluk — coin terimi kullanılmaz, LP ömür puanı
  return getLpLifetime(l);
}

export function customerBadges(customer,loyalty,db){
  const h=(db.history||[]).filter(x=>x.customerId===customer.id);
  const badges=[];
  const lifetime=loyalty?.lpLifetime||loyalty?.lifetimeStamps||0;
  if(lifetime>=50)badges.push({emoji:'🥈',title:'Silver Club',desc:'50+ LP'});
  if(lifetime>=150)badges.push({emoji:'🥇',title:'Gold Club',desc:'150+ LP'});
  if(lifetime>=300)badges.push({emoji:'🖤',title:'Black Club',desc:'300+ LP'});
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
    const current=migrateLoyaltyCard(next.loyalty[customerId]||loyaltyTemplate(customerId));
    const bonus=Number(coupon.rewardValue||1)*7;
    next={...next,loyalty:{...next.loyalty,[customerId]:{...current,lpBalance:(current.lpBalance||0)+bonus,lpLifetime:(current.lpLifetime||0)+bonus,level:levelByLp((current.lpLifetime||0)+bonus)}}};
  }else{
    next=addCategoryStampToCustomer(next,customerId,'coffee',Number(coupon.rewardValue||1),`Kupon ${code}`);
  }
  return next;
}

export function redeemCategoryRewardForCustomer(db,id,category,source='Admin'){
  const customer=db.customers.find(c=>c.id===id);
  if(!customer)return db;

  const valid=STAMP_CATEGORIES.some(cat=>cat.id===category);
  if(!valid)return db;

  const current=migrateLoyaltyCard(db.loyalty[id]||loyaltyTemplate(id));
  const cost=getCategoryRewardCost(category);
  const catLabel=STAMP_CATEGORIES.find(cat=>cat.id===category)?.label||category;

  if(!canRedeemLpReward(current,category)){
    if(typeof globalThis.alert==='function') alert('Yetersiz LP');
    return db;
  }

  const oldBalance=current.lpBalance||0;
  const nextBalance=Math.max(0, oldBalance-cost);
  const createdAt=new Date().toLocaleString('tr-TR');
  const redeemType=LP_HISTORY_REDEEM[category]||'lp_reward_redeem';
  const redeemTitle=STAMP_CATEGORIES.find(cat=>cat.id===category)?.redeemTitle||`${catLabel} ikram`;
  const next={
    ...current,
    lpBalance:nextBalance,
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
        type:redeemType,
        count:cost,
        category,
        categoryLabel:catLabel,
        reward:STAMP_CATEGORIES.find(cat=>cat.id===category)?.rewardLabel||redeemTitle,
        lpBefore:oldBalance,
        lpAfter:nextBalance,
        before:{lpBalance:oldBalance,usedRewards:current.usedRewards||0},
        after:{lpBalance:nextBalance,usedRewards:next.usedRewards},
        source,
        createdAt
      },
      ...(db.history||[])
    ]
  };
}

export function redeemRewardForCustomer(db,id,source='Admin',category='coffee'){
  return redeemCategoryRewardForCustomer(db,id,category,source);
}

export function applyBirthdayReward(db,id){
  // Otomatik LP bonusu kaldırıldı — doğum günü kahvesi kasiyer tarafından uygulanır
  return db;
}

// Seviye indirimi — ayda bir kez, LP düşmez
export function applyTierDiscount(db,id,source='Kasiyer'){
  const customer=db.customers.find(c=>c.id===id);
  if(!customer)return db;

  const current=migrateLoyaltyCard(db.loyalty[id]||loyaltyTemplate(id));
  const level=current.level||levelByLp(current.lpLifetime||0);
  const percent=getTierDiscountPercent(level);

  if(!percent){
    if(typeof globalThis.alert==='function') alert('Bu seviyede indirim hakkı yok.');
    return db;
  }

  if(!canUseMonthlyDiscount(current,level)){
    if(typeof globalThis.alert==='function') alert('Bu ay indirim hakkı zaten kullanıldı.');
    return db;
  }

  const monthKey=currentMonthKey();
  const createdAt=new Date().toLocaleString('tr-TR');
  const nextCard={
    ...current,
    monthlyDiscountMonth:monthKey,
    updatedAt:createdAt
  };

  return{
    ...db,
    loyalty:{...db.loyalty,[id]:nextCard},
    history:[
      {
        id:Date.now()+72,
        customerId:id,
        name:customer.name,
        phone:customer.phone,
        type:'tier_discount',
        count:percent,
        reward:`${level} seviye indirimi %${percent}`,
        month:monthKey,
        level,
        source,
        createdAt
      },
      ...(db.history||[])
    ]
  };
}

// Doğum günü kahvesi — yılda bir kez, LP etkilemez
export function applyBirthdayCoffee(db,id,source='Kasiyer'){
  const customer=db.customers.find(c=>c.id===id);
  if(!customer)return db;

  const year=new Date().getFullYear();

  if(isBirthdayCoffeeUsed(db.history||[],id,year)){
    if(typeof globalThis.alert==='function') alert('Doğum günü kahvesi bu yıl zaten kullanıldı.');
    return db;
  }

  if(!customer.birthDate){
    if(typeof globalThis.alert==='function') alert('Müşterinin doğum tarihi tanımlı değil.');
    return db;
  }

  if(!isBirthdayToday(customer.birthDate)){
    if(typeof globalThis.alert==='function') alert('Doğum günü kahvesi yalnızca doğum gününde kullanılabilir.');
    return db;
  }

  const createdAt=new Date().toLocaleString('tr-TR');

  return{
    ...db,
    history:[
      {
        id:Date.now()+73,
        customerId:id,
        name:customer.name,
        phone:customer.phone,
        type:'birthday_coffee',
        count:1,
        reward:'Doğum günü kahve ikramı',
        year,
        source,
        createdAt
      },
      ...(db.history||[])
    ]
  };
}

export {
  STAMP_CATEGORIES,
  STAMP_SLOT_COUNT,
  countTotalRewards,
  countTotalStamps,
  normalizeCategoryRewards,
  normalizeCategoryStamps,
  stampCardProgress,
  stampsRemaining,
  getStampRulesText,
  categoryProgress,
  getLpCardView,
  getLpBalance,
  getRedeemableRewards,
  canRedeemLpReward,
  getLpLifetime,
  pickLoyaltyCard,
  lpRewardStatusText
} from './loyaltyStamps.js';

export {
  getMembershipView,
  tierBenefits,
  UNIVERSAL_MEMBERSHIP_BENEFITS,
  TIER_DISCOUNT_RULES,
  getTierDiscountPercent,
  canUseMonthlyDiscount,
  getBirthdayCoffeeStatus
} from './membershipTier.js';
