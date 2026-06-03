import React,{useEffect,useRef,useState}from'react';
import{Html5Qrcode}from'html5-qrcode';
import{Gift,Image as ImageIcon,Instagram,Mail,MapPin,Minus,Plus,QrCode,ScanLine,Send,ShieldCheck,Sparkles,Star,Trash2,UploadCloud}from'lucide-react';
import{mapsUrl,instagramUrl,yemeksepetiUrl}from'../lib/constants.js';
import{addStampToCustomer,applyBirthdayReward,applyCouponToCustomer,checkInCustomer,claimDailyLoginReward,claimFirstOrderBonus,fileToDataUrl,levelByStamps,localDayKey,loyaltyTemplate,money,norm,redeemRewardForCustomer,seed,spinLuckyWheel,vipBenefits,calculateCoins,customerBadges,productImageSrc,getReferralCode}from'../lib/db.js';
import{CustomerCardsAdmin,ReviewApprovalAdmin,LuckyWheelCard,DailyRewardCard,FirstOrderBonusCard,GoogleReviewBonusCard,ReferralCard,RewardsCenterCard,VipBenefitsCard,Product}from'../components/Cards.jsx';

export default function AdminPage({db,commit}){
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
  const[success,setSuccess]=useState(false);
  const scanner=useRef(null);

  useEffect(()=>()=>{try{scanner.current?.stop()}catch{}},[]);

  async function stopScanner(){
    try{await scanner.current?.stop()}catch{}
    scanner.current=null;
    setActive(false);
  }

  async function start(){
    setFound(null);
    setSuccess(false);
    setMsg('Kamera açılıyor...');
    setActive(true);

    setTimeout(async()=>{
      try{
        scanner.current=new Html5Qrcode('reader');
        await scanner.current.start(
          {facingMode:'environment'},
          {fps:12,qrbox:{width:240,height:240}},
          txt=>{
            try{
              const data=JSON.parse(txt);
              const c=db.customers.find(x=>String(x.id)===String(data.id)||x.phone===data.phone);
              if(c){
                setFound(c);
                setSuccess(true);
                setMsg('Müşteri bulundu!');
                stopScanner();
              }else{
                setMsg('Müşteri bulunamadı.');
              }
            }catch{
              setMsg('Geçerli Liberte QR kodu okut.');
            }
          }
        );
      }catch(e){
        setMsg('Kamera açılamadı: '+e.message);
        setActive(false);
      }
    },100);
  }

  async function rescan(){
    await stopScanner();
    setFound(null);
    setSuccess(false);
    setMsg('');
    start();
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

  return <div className="card scanPanelCard">
    <div className="scanPanelHead">
      <div>
        <span>KASİYER</span>
        <h3>QR Okuyucu</h3>
      </div>
      {!active&&!found&&<button type="button" className="goldBtn scanStartBtn" onClick={start}><ScanLine size={18}/> Kamera Aç</button>}
      {(active||found)&&<button type="button" className="ghost scanRescanBtn" onClick={rescan}><ScanLine size={16}/> Yeniden Tara</button>}
    </div>

    {active&&<div className="scannerFrame">
      <div id="reader" />
      <div className="scannerOverlay" aria-hidden="true">
        <span className="scannerCorner tl" /><span className="scannerCorner tr" />
        <span className="scannerCorner bl" /><span className="scannerCorner br" />
        <span className="scannerLine" />
      </div>
    </div>}

    <p className={`scanMsg${success?' isSuccess':''}`}>{msg||'Müşteri QR kodunu okut. Damga ve ikram işlemleri sisteme kaydedilir.'}</p>

    {found&&<div className={`found rewardBox scanFoundCard${success?' scanFoundPop':''}`}>
      <div className="scanFoundTop">
        <div>
          <b>{found.name}</b>
          <span>{found.phone} · {found.email||'mail yok'}</span>
        </div>
        <span className="scanFoundBadge">LC-{found.id}</span>
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
    first_order_bonus:'İlk sipariş bonusu'
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
