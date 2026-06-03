import React,{useEffect,useRef,useState}from'react';
import{Html5Qrcode}from'html5-qrcode';
import{Gift,Image as ImageIcon,LayoutDashboard,Megaphone,Minus,Plus,QrCode,ScanLine,Send,Settings,ShieldCheck,Smartphone,Sparkles,Trash2,UploadCloud,Users,UtensilsCrossed}from'lucide-react';
import Brand from '../components/Brand.jsx';
import{addStampToCustomer,applyCouponToCustomer,checkInCustomer,fileToDataUrl,levelByStamps,localDayKey,loyaltyTemplate,money,norm,redeemRewardForCustomer,seed,getReferralCode}from'../lib/db.js';
import{ReviewApprovalAdmin,Product}from'../components/Cards.jsx';

const ADMIN_TABS=[
  {id:'overview',label:'Özet',Icon:LayoutDashboard},
  {id:'kasa',label:'Kasa',Icon:ScanLine},
  {id:'menu',label:'Menü',Icon:UtensilsCrossed},
  {id:'kampanya',label:'Kampanya',Icon:Megaphone},
  {id:'uyeler',label:'Üyeler',Icon:Users},
  {id:'ayarlar',label:'Ayarlar',Icon:Settings}
];

export default function AdminPage({db,commit}){
  const[tab,setTab]=useState('overview');
  const deviceCount=(db.pushSubscriptions||[]).length;

  return <section className="pageShell adminPage">
    <div className="adminPremiumHero">
      <div className="adminHeroBrand">
        <Brand db={db} admin />
        <div>
          <span>{db.settings.cafe_name||'Liberte Gastro Cafe'}</span>
          <h2>Yönetim Paneli</h2>
          <p>{db.customers.length} üye · {deviceCount} bildirim cihazı</p>
        </div>
      </div>
      <div className="adminHeroBadge"><ShieldCheck size={16}/> Admin</div>
    </div>

    <div className="adminNavPills">
      {ADMIN_TABS.map(({id,label,Icon})=>
        <button type="button" key={id} className={tab===id?'on':''} onClick={()=>setTab(id)}>
          <Icon size={17}/><span>{label}</span>
        </button>
      )}
    </div>

    <div className="adminContent">
      {tab==='overview'&&<OverviewAdmin db={db}/>}
      {tab==='kasa'&&<ScanPanel db={db} commit={commit}/>}
      {tab==='menu'&&<MenuAdmin db={db} commit={commit}/>}
      {tab==='kampanya'&&<KampanyaAdmin db={db} commit={commit}/>}
      {tab==='uyeler'&&<MembersAdmin db={db} commit={commit}/>}
      {tab==='ayarlar'&&<SettingsAdmin db={db} commit={commit}/>}
    </div>
  </section>;
}

function MenuAdmin({db,commit}){
  return <div className="adminStack">
    <CategoryAdmin db={db} commit={commit}/>
    <ItemAdmin db={db} commit={commit}/>
  </div>;
}

function KampanyaAdmin({db,commit}){
  return <div className="adminStack">
    <NotificationAdmin db={db} commit={commit}/>
    <GameAdmin db={db} commit={commit}/>
  </div>;
}

function MembersAdmin({db,commit}){
  return <div className="adminStack">
    <ReviewApprovalAdmin db={db} commit={commit}/>
    <UsersAdmin db={db} commit={commit}/>
  </div>;
}

function SettingsAdmin({db,commit}){
  return <div className="adminStack">
    <DesignAdmin db={db} commit={commit}/>
    <CouponsAdmin db={db} commit={commit}/>
  </div>;
}
function OverviewAdmin({db}){
  const customers=db.customers||[];
  const loyalty=db.loyalty||{};
  const history=db.history||[];
  const totalStamps=Object.values(loyalty).reduce((a,l)=>a+(l.lifetimeStamps||0),0);
  const activeRewards=Object.values(loyalty).reduce((a,l)=>a+(l.availableRewards||0),0);
  const pushCount=(db.pushSubscriptions||[]).length;
  const today=new Date().toLocaleDateString('tr-TR');
  const todayEvents=history.filter(h=>String(h.createdAt||'').startsWith(today)).length;
  const topCustomers=[...customers]
    .map(c=>({c,l:loyalty[c.id]||loyaltyTemplate(c.id)}))
    .sort((a,b)=>(b.l.lifetimeStamps||0)-(a.l.lifetimeStamps||0))
    .slice(0,5);

  const historyLabel=t=>({
    stamp_add:'Damga eklendi',
    stamp_remove:'Damga silindi',
    reward_redeem:'Hak kullanıldı',
    wheel_spin:'Şans çarkı',
    daily_login:'Günlük ödül',
    check_in:'Check-in',
    google_review_bonus:'Google bonusu',
    customer_edit:'Üye düzenlendi'
  }[t]||t);

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
    <div className="adminSectionHead">
      <div><span>ÖZET</span><h3>İşletme durumu</h3></div>
      <button type="button" className="ghost adminExportBtn" onClick={exportData}><ShieldCheck size={16}/> Yedek</button>
    </div>

    <div className="analyticsGrid adminMetricsCompact">
      <div className="metricCard"><span>Üye</span><b>{customers.length}</b><small>Kayıtlı</small></div>
      <div className="metricCard"><span>Damga</span><b>{totalStamps}</b><small>Toplam</small></div>
      <div className="metricCard"><span>Aktif Hak</span><b>{activeRewards}</b><small>İkram</small></div>
      <div className="metricCard"><span>Bugün</span><b>{todayEvents}</b><small>İşlem</small></div>
      <div className="metricCard"><span>Cihaz</span><b>{pushCount}</b><small>Bildirim</small></div>
      <div className="metricCard"><span>Çark</span><b>{(db.wheelSpins||[]).length}</b><small>Çevirme</small></div>
    </div>

    <div className="card topMembers adminSectionCard">
      <h3>En sadık üyeler</h3>
      {topCustomers.length?topCustomers.map(({c,l},i)=>
        <div className="topMember" key={c.id}>
          <span>{i+1}</span>
          <div>
            <b>{c.name}</b>
            <p>{l.level||'Bronze'} · {l.lifetimeStamps||0} damga · {l.availableRewards||0} hak</p>
          </div>
        </div>
      ):<div className="empty">Henüz müşteri yok.</div>}
    </div>

    <div className="card adminSectionCard">
      <h3>Son işlemler</h3>
      {(history||[]).slice(0,15).map(h=>
        <div className="historyMini" key={h.id}>
          <div>
            <b>{historyLabel(h.type)}</b>
            <p>{h.name||'Müşteri'} · {h.createdAt}</p>
          </div>
          <strong>{h.type==='reward_redeem'?'Hak':h.count>0?`+${h.count}`:h.count||'•'}</strong>
        </div>
      )}
      {!history.length&&<div className="empty">Henüz işlem yok.</div>}
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

  return <div className="card adminSectionCard designAdminCard">
    <div className="adminSectionHead"><div><span>MARKA</span><h3>Tasarım & logo</h3></div></div>

    <div className="designLogoPreview">
      {s.logo
        ? <img src={s.logo} alt="Liberte logo"/>
        : <div className="designLogoFallback"><b>L</b><span>Liberte</span></div>}
    </div>

    <label className="file">
      <ImageIcon/> Logo yükle
      <input type="file" accept="image/*" onChange={logo}/>
    </label>

    <label>Uygulama adı</label>
    <input value={s.app_name||''} onChange={e=>set({app_name:e.target.value})}/>

    <label>Kafe adı</label>
    <input value={s.cafe_name||''} onChange={e=>set({cafe_name:e.target.value})}/>

    <label>Ana başlık</label>
    <input value={s.hero_title} onChange={e=>set({hero_title:e.target.value})}/>

    <label>Kampanya metni</label>
    <textarea value={s.promo_text} onChange={e=>set({promo_text:e.target.value})}/>

    <div className="designColorRow">
      <div><label>Arka plan</label><input type="color" value={s.bg} onChange={e=>set({bg:e.target.value})}/></div>
      <div><label>Kart</label><input type="color" value={s.card} onChange={e=>set({card:e.target.value})}/></div>
      <div><label>Vurgu</label><input type="color" value={s.accent} onChange={e=>set({accent:e.target.value})}/></div>
    </div>

    {s.logo&&<button type="button" className="ghost" onClick={()=>set({logo:''})}>Logoyu kaldır</button>}
  </div>;
}

function CouponsAdmin({db,commit}){
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

  return <div className="card adminSectionCard">
    <div className="adminSectionHead"><div><span>KUPON</span><h3>Promosyon kodları</h3></div></div>

    <input placeholder="Örn: LIBERTE20" value={code} onChange={e=>setCode(e.target.value)}/>
    <input placeholder="Kupon başlığı" value={title} onChange={e=>setTitle(e.target.value)}/>
    <select value={type} onChange={e=>setType(e.target.value)}>
      <option value="stamp">Damga ver</option>
      <option value="reward">İkram hakkı ver</option>
    </select>
    <input type="number" min="1" value={value} onChange={e=>setValue(e.target.value)}/>
    <button type="button" onClick={createCoupon}><Plus/> Kupon oluştur</button>

    <div className="couponList">
      {(db.coupons||[]).map(c=><div className="historyMini" key={c.id}>
        <div><b>{c.code}</b><p>{c.title} · {c.rewardType==='reward'?'İkram':'Damga'} +{c.rewardValue}</p></div>
        <button type="button" className={c.active?'ghost':'danger'} onClick={()=>toggleCoupon(c.id)}>{c.active?'Aktif':'Pasif'}</button>
      </div>)}
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

  return <div className="gameAdmin adminStack">
    <div className="card adminSectionCard">
      <div className="adminSectionHead"><div><span>KAMPANYA</span><h3>Günün kampanyası</h3></div></div>
      <label>Emoji</label>
      <input value={form.emoji} onChange={e=>setForm({...form,emoji:e.target.value})}/>
      <label>Başlık</label>
      <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
      <label>Açıklama</label>
      <textarea value={form.body} onChange={e=>setForm({...form,body:e.target.value})}/>
      <label className="adminToggle"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/><span>Kampanya aktif</span></label>
      <button type="button" onClick={saveCampaign}><ShieldCheck/> Kaydet</button>
    </div>

    <div className="card adminSectionCard">
      <div className="adminSectionHead"><div><span>ÇARK</span><h3>Şans çarkı ödülleri</h3></div></div>
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
      <button type="button" className="ghost" onClick={()=>setPrizes([...prizes,{id:Date.now(),label:'+1 Damga',type:'stamp',value:1,weight:10}])}><Plus/> Ödül ekle</button>
      <button type="button" onClick={savePrizes}><ShieldCheck/> Çarkı kaydet</button>
    </div>
  </div>;
}


function NotificationAdmin({db,commit}){
  const[title,setTitle]=useState('Liberte Club');
  const[body,setBody]=useState('Bugüne özel kampanya seni bekliyor.');
  const[status,setStatus]=useState('');
  const[sending,setSending]=useState(false);
  const devices=db.pushSubscriptions||[];
  const pushLog=db.pushLog||[];

  const templates=[
    {label:'Smash',title:'Smash zamanı 🍔',body:'Bugüne özel Smash Menü seni bekliyor.'},
    {label:'Tatlı',title:'Tatlı molası 🍓',body:'Magnolia ve kahve ikilisiyle gününü güzelleştir.'},
    {label:'Seni özledik',title:'Seni özledik ☕',body:'Liberte\'ye gel, ekstra damga kazan.'},
    {label:'Doğum günü',title:'Doğum günün kutlu olsun 🎂',body:'Doğum gününe özel 1 içecek ikramın hesabında.'},
    {label:'Çark',title:'Şans çarkın hazır 🎡',body:'Bugün çarkı çevirmedin — sürpriz ödül seni bekliyor.'}
  ];

  async function sendPush(){
    if(!title.trim()||!body.trim())return alert('Başlık ve mesaj zorunlu.');
    setSending(true);
    setStatus('Gönderiliyor...');
    const tokens=devices.map(x=>x.token).filter(Boolean);
    const createdAt=new Date().toLocaleString('tr-TR');
    const logId=Date.now();
    let next={
      ...db,
      notifications:[{id:logId,title,body,createdAt},...(db.notifications||[])],
      pushLog:[{id:logId,title,body,deviceCount:devices.length,sent:0,failed:0,note:'',createdAt},...pushLog].slice(0,30)
    };
    commit(next);

    if(!tokens.length){
      setStatus('Kayıtlı cihaz yok. Bildirim uygulama içi kaydedildi.');
      setSending(false);
      return;
    }

    try{
      const r=await fetch('/api/push/send',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({tokens,title,body})
      });
      const j=await r.json();
      const note=j.note||`${j.sent||0} cihaza iletildi${j.failed?`, ${j.failed} başarısız`:''}.`;
      setStatus(note);
      commit({
        ...next,
        pushLog:next.pushLog.map(x=>x.id===logId?{...x,sent:j.sent||0,failed:j.failed||0,note}:x)
      });
    }catch{
      setStatus('Uygulama içi kaydedildi. Push sunucusuna ulaşılamadı.');
    }
    setSending(false);
  }

  function removeDevice(id,token){
    if(!confirm('Bu cihaz listeden kaldırılsın mı?'))return;
    commit({...db,pushSubscriptions:devices.filter(x=>x.id!==id&&x.token!==token)});
  }

  return <div className="notificationAdmin">
    <div className="card adminSectionCard pushComposer">
      <div className="adminSectionHead">
        <div><span>BİLDİRİM</span><h3>Kurulu cihazlara gönder</h3></div>
        <span className="deviceCountBadge"><Smartphone size={14}/> {devices.length} cihaz</span>
      </div>
      <p className="pushHint">Uygulamayı yükleyip bildirim izni veren üyelere anlık push gönderilir.</p>

      <div className="pushPreview">
        <span>Önizleme</span>
        <b>{title||'Başlık'}</b>
        <p>{body||'Mesaj içeriği'}</p>
      </div>

      <label>Başlık</label>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Bildirim başlığı"/>

      <label>Mesaj</label>
      <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Bildirim metni" rows={3}/>

      <div className="pushTemplates">
        {templates.map(t=>
          <button type="button" key={t.label} className="ghost" onClick={()=>{setTitle(t.title);setBody(t.body);}}>{t.label}</button>
        )}
      </div>

      <button type="button" className="goldBtn pushSendBtn" onClick={sendPush} disabled={sending}>
        <Send size={18}/> {sending?'Gönderiliyor...':'Tüm cihazlara gönder'}
      </button>
      {status&&<p className={`scanMsg${status.includes('iletildi')||status.includes('cihaza')?' isSuccess':''}`}>{status}</p>}
    </div>

    <div className="card adminSectionCard">
      <div className="adminSectionHead"><div><span>CİHAZLAR</span><h3>Kayıtlı bildirim cihazları</h3></div></div>
      {devices.length?devices.map(d=>
        <div className="deviceRow" key={d.id||d.token}>
          <div><b>{d.name||'Üye'}</b><p>{d.phone||'—'} · {d.createdAt||'Tarih yok'}</p></div>
          <button type="button" className="ghost deviceRemoveBtn" onClick={()=>removeDevice(d.id,d.token)} aria-label="Kaldır"><Trash2 size={14}/></button>
        </div>
      ):<p className="emptySmall">Henüz bildirim izni veren cihaz yok. Üyeler uygulamada &quot;Bildirim Aç&quot; butonuna basmalı.</p>}
    </div>

    {pushLog.length>0&&<div className="card adminSectionCard">
      <div className="adminSectionHead"><div><span>GEÇMİŞ</span><h3>Son gönderimler</h3></div></div>
      {pushLog.slice(0,8).map(p=>
        <div className="historyMini" key={p.id}>
          <div><b>{p.title}</b><p>{p.createdAt} · {p.sent||0}/{p.deviceCount||0} cihaz{p.note?` · ${p.note}`:''}</p></div>
          <strong>{p.sent||0}</strong>
        </div>
      )}
    </div>}
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
