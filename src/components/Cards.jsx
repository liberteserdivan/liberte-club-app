import React,{useEffect,useState}from'react';
import{Bell,Coffee,Crown,Gift,Plus,QrCode,Send,ShieldCheck,Sparkles,Star}from'lucide-react';
import{googleReviewUrl}from'../lib/constants.js';
import{tryEnablePush}from'../lib/firebasePush.js';
import{
  canRequestPushOnThisDevice,
  getPushPromptHint,
  markPushDismissed,
  shouldShowPushPrompt
}from'../lib/pushPrompt.js';
import{getPushSettingsHint}from'../lib/nativePush.js';
import{addStampToCustomer,checkInCustomer,getReferralCode,levelByStamps,loyaltyTemplate,money,productImageSrc,seed,vipBenefits,customerBadges,redeemRewardForCustomer,getLpBalance,getRedeemableRewards}from'../lib/db.js';
import{historyTypeLabel,historyAmountLabel}from'../lib/loyaltyStamps.js';
import{isNativeApp,isAndroid,isIos}from'../lib/platform.js';
import{
  getDeferredPwaPrompt,
  getInstallCardHint,
  getInstallHelpText,
  requestPwaInstall,
  shouldShowInstallCard
}from'../lib/pwaInstall.js';
export function CustomerHistoryCard({db,customer}){
  const rows=(db.history||[]).filter(h=>h.customerId===customer.id).slice(0,5);

  const label=(h)=>historyTypeLabel(h.type);

  const badge=(h)=>historyAmountLabel(h);

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
    ):<p className="emptySmall">Henüz işlem geçmişi yok. İlk LP&apos;ni kasada QR ile kazanabilirsin.</p>}
  </div>;
}


export function ReferralCard({db,customer}){
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

export function GoogleReviewBonusCard({db,customer,commit,compact=false}){
  const requests=db.googleReviewRequests||[];
  const approved=(db.history||[]).some(h=>h.customerId===customer.id&&h.type==='google_review_bonus');
  const pending=requests.some(r=>r.customerId===customer.id&&r.status==='pending');

  function requestBonus(){
    window.open(googleReviewUrl,'_blank','noopener,noreferrer');
    if(approved){alert('Google yorum bonusun daha önce işlendi.');return;}
    if(pending){alert('Yorum talebin admin onayı bekliyor.');return;}
    const createdAt=new Date().toLocaleString('tr-TR');
    // Müşteri yalnızca admin onayı bekleyen talep oluşturur; damga admin onayında verilir
    commit({
      ...db,
      googleReviewRequests:[
        {id:Date.now(),customerId:customer.id,name:customer.name,phone:customer.phone,email:customer.email,status:'pending',createdAt},
        ...requests
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

export function InstallAppCard(){
  const[canNativeInstall,setCanNativeInstall]=useState(()=>Boolean(getDeferredPwaPrompt()));
  const[visible,setVisible]=useState(()=>shouldShowInstallCard(isNativeApp()));

  useEffect(()=>{
    const sync=()=>{
      setCanNativeInstall(Boolean(getDeferredPwaPrompt()));
      setVisible(shouldShowInstallCard(isNativeApp()));
    };
    window.addEventListener('liberte:pwa-install-ready',sync);
    window.addEventListener('liberte:pwa-installed',sync);
    return()=>{
      window.removeEventListener('liberte:pwa-install-ready',sync);
      window.removeEventListener('liberte:pwa-installed',sync);
    };
  },[]);

  async function install(){
    const result=await requestPwaInstall();
    if(result.ok){
      setVisible(false);
      return;
    }
    alert(getInstallHelpText());
  }

  if(!visible)return null;

  const buttonLabel=canNativeInstall
    ?'Ana Ekrana Ekle'
    :(isAndroid()?'Nasıl Eklenir?':isIos()?'Ana Ekrana Ekle':'Ana Ekrana Ekle');

  return <div className="installCard">
    <div>
      <span>UYGULAMA GİBİ KULLAN</span>
      <b>Liberte Club ana ekranında dursun</b>
      <p>{getInstallCardHint(canNativeInstall)}</p>
    </div>
    <button type="button" onClick={install}>{buttonLabel}</button>
  </div>;
}

export function OfflineNotice(){
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


export function ReviewCard({db,commit,customer}){
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
  const result=await tryEnablePush(customer,db,commit);
  alert(result.message);
}

export function PushPermission({customer,db,commit}){
  return <div className="card push">
    <div>
      <b>Kampanyaları kaçırma</b>
      <p>Ödül, fırsat ve yeni ürün bildirimleri gelsin.</p>
    </div>
    <button onClick={()=>enablePush(customer,db,commit)}><Bell/> Bildirim Aç</button>
  </div>;
}

// İlk ziyarette bildirim izni banner'ı
export function PushWelcomeBanner({customer,db,commit}){
  const[visible,setVisible]=useState(()=>shouldShowPushPrompt(customer,db));

  useEffect(()=>{
    setVisible(shouldShowPushPrompt(customer,db));
  },[customer?.id,db.pushSubscriptions]);

  function dismiss(){
    markPushDismissed(customer.id);
    setVisible(false);
  }

  async function accept(){
    if(!canRequestPushOnThisDevice()){
      alert('iPhone\'da bildirimler için önce Safari paylaş menüsünden "Ana Ekrana Ekle" yapmalısın. Uygulamayı ana ekrandan açınca Bildirimleri Aç seçeneği görünür.');
      return;
    }

    const result=await tryEnablePush(customer,db,commit);
    if(result.ok)setVisible(false);
    else alert(result.message?.includes('kapalı') ? result.message : `${result.message}${isNativeApp() ? `\n\n${getPushSettingsHint()}` : ''}`);
  }

  if(!visible)return null;

  return <div className="pushWelcomeBanner">
    <div className="pushWelcomeIcon"><Bell size={22}/></div>
    <div>
      <b>Kampanyalardan haberdar ol</b>
      <p>{getPushPromptHint()}</p>
    </div>
    <div className="pushWelcomeActions">
      <button type="button" className="goldBtn" onClick={accept}>Bildirimleri Aç</button>
      <button type="button" className="ghost" onClick={dismiss}>Sonra</button>
    </div>
  </div>;
}

export function Product({item}){
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


export function ClubStatusCard({db,customer}){
  const l=db.loyalty[customer.id]||loyaltyTemplate(customer.id);
  const badges=customerBadges(customer,l,db);
  const lp=getLpBalance(l);
  return <div className="card clubStatusCard">
    <div className="clubTop"><div><span>LIBERTE PUAN</span><b>{lp} LP</b></div><Crown/></div>
    <p>Rozetlerin ve LP&apos;nin Liberte Club seviyeni güçlendirir.</p>
    <div className="badgeGrid">
      {badges.map(b=><div className="badgePill" key={b.title}><strong>{b.emoji}</strong><span>{b.title}</span><small>{b.desc}</small></div>)}
    </div>
  </div>;
}

export function DailyCampaignCard({db,setTab}){
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

export function VipBenefitsCard({db,customer}){
  const l=db.loyalty[customer.id]||loyaltyTemplate(customer.id);
  const level=l.level||levelByStamps(l.lifetimeStamps||0);
  return <div className="card vipBenefitsCard">
    <div className="clubTop"><div><span>VIP SEVİYE</span><b>{level} Club</b></div><Crown/></div>
    <div className="vipBenefitList">
      {vipBenefits(level).map(x=><div key={x}><ShieldCheck/><span>{x}</span></div>)}
    </div>
  </div>;
}



export function RewardsCenterCard({db,customer,card}){
  const lp=getLpBalance(card);
  const redeemable=getRedeemableRewards(card);
  const birthday=(db.history||[]).some(h=>h.customerId===customer.id&&h.type==='birthday_reward');
  const rows=[
    ...redeemable.map((cat)=>({title:cat.rewardLabel,count:1,desc:'Kasada QR göstererek kullandırılır.'})),
    {title:'Doğum günü hediyesi',count:birthday?1:0,desc:'Doğum gününde hesabına tanımlanan özel ikram.'}
  ].filter(x=>x.count>0);
  return <div className="rewardsCenter card">
    <div className="centerHead">
      <div><span>ÖDÜL MERKEZİ</span><h3>Kazanılabilir Ödüller</h3></div>
      <Gift/>
    </div>
    {rows.length?rows.map((r,i)=><div className="rewardLine" key={i}>
      <div><b>{r.title}</b><p>{r.desc}</p></div><strong>{r.count}</strong>
    </div>):<p className="emptySmall">Henüz kullanılabilir ödülün yok. LP biriktirmeye devam et. ({lp} LP)</p>}
  </div>;
}

export function FullHistoryCard({db,customer}){
  const rows=(db.history||[]).filter(h=>h.customerId===customer.id).slice(0,30);
  const label=(t)=>historyTypeLabel(t);
  return <div className="fullHistory card">
    <div className="centerHead"><div><span>İŞLEM GEÇMİŞİ</span><h3>LP Hareketleri</h3></div><ShieldCheck/></div>
    {rows.length?rows.map(h=><div className="historyLine" key={h.id}>
      <div><b>{label(h.type)}</b><p>{h.createdAt} · {h.source||h.categoryLabel||'Liberte Club'}</p></div>
      <strong>{historyAmountLabel(h)}</strong>
    </div>):<p className="emptySmall">Henüz işlem geçmişi yok.</p>}
  </div>;
}

export function NotificationCenterCard({db,customer}){
  const rows=(db.notifications||[]).filter(n=>!n.customerId||n.customerId===customer.id).slice(0,20);
  return <div className="notificationCenter card">
    <div className="centerHead"><div><span>BİLDİRİM MERKEZİ</span><h3>Duyurular ve Hatırlatmalar</h3></div><Bell/></div>
    {rows.length?rows.map(n=><div className="notifyLine" key={n.id}>
      <b>{n.title}</b><p>{n.body}</p><small>{n.createdAt}</small>
    </div>):<p className="emptySmall">Henüz bildirim yok.</p>}
  </div>;
}

export function ReviewApprovalAdmin({db,commit}){
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

export function CustomerCardsAdmin({db,commit}){
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
      <div className="detailStats"><div><span>LP</span><b>{getLpBalance(l)}</b></div><div><span>Ödül</span><b>{getRedeemableRewards(l).length}</b></div><div><span>Seviye</span><b>{l.level||'Bronze'}</b></div><div><span>Toplam</span><b>{l.lpLifetime||l.lifetimeStamps||0}</b></div></div>
      {notes&&<p className="customerNote big">Not: {notes}</p>}
      <div className="adminActions"><button onClick={()=>commit(addStampToCustomer(db,customer.id,1,'Müşteri kartı'))}><Plus/> +1 LP</button><button className="goldBtn" onClick={()=>commit(redeemRewardForCustomer(db,customer.id,'Müşteri kartı','coffee'))}><Gift/> Ödül Kullan</button><button className="ghost" onClick={()=>commit(checkInCustomer(db,customer.id,'Müşteri kartı'))}><QrCode/> Check-in</button></div>
    </div>
    <div className="card"><h3>Son Hareketler</h3>{history.length?history.map(h=><div className="historyMini" key={h.id}><div><b>{historyTypeLabel(h.type)}</b><p>{h.createdAt} · {h.source}</p></div><strong>{historyAmountLabel(h)}</strong></div>):<p className="emptySmall">Geçmiş yok.</p>}</div>
  </div>;
}
