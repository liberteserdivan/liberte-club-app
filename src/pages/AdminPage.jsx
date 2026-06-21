import React,{useEffect,useRef,useState}from'react';
import{Database,Download,Edit2,Gift,Image as ImageIcon,LayoutDashboard,Megaphone,Minus,Plus,RotateCcw,Send,Settings,ShieldCheck,Smartphone,Sparkles,Trash2,UploadCloud,Users,UtensilsCrossed}from'lucide-react';
import Brand from '../components/Brand.jsx';
import StampCategoryPanel from '../components/StampCategoryPanel.jsx';
import PushNotificationAdmin from '../components/PushNotificationAdmin.jsx';
import{addCategoryStampToCustomer,addStampToCustomer,applyCouponToCustomer,fileToDataUrl,levelByStamps,localDayKey,loyaltyTemplate,money,norm,redeemCategoryRewardForCustomer,seed,getReferralCode,getLpBalance,getRedeemableRewards,STAMP_CATEGORIES}from'../lib/db.js';
import{historyTypeLabel}from'../lib/loyaltyStamps.js';
import{STORE_APP_NAME}from'../lib/constants.js';
import{dispatchPush}from'../lib/pushDispatch.js';
import{downloadBackup,downloadLocalBackup,downloadAdminSnapshotBackup,fetchBackupList,restoreBackupFile,restoreBackupSnapshot}from'../lib/backupClient.js';
import ErrorLogsAdmin from '../components/ErrorLogsAdmin.jsx';
import{ReviewApprovalAdmin}from'../components/Cards.jsx';
import CashierProductPickModal from '../components/CashierProductPickModal.jsx';
import {
  assertMenuItemCanEarnLp,
  requiresProductPickForLpCategory
} from '../lib/menuLp.js';
import { deleteAdminMember } from '../lib/adminMemberClient.js';
import { useLocalAuth } from '../lib/devAuth.js';
import { formatPhoneInput } from '../lib/phoneMask.js';

const ADMIN_TABS=[
  {id:'overview',label:'Özet',Icon:LayoutDashboard},
  {id:'menu',label:'Menü',Icon:UtensilsCrossed},
  {id:'kampanya',label:'Kampanya',Icon:Megaphone},
  {id:'uyeler',label:'Üyeler',Icon:Users},
  {id:'ayarlar',label:'Ayarlar',Icon:Settings}
];

// Üye telefonunu okunaklı göster
function displayMemberPhone(phone) {
  return formatPhoneInput(phone) || String(phone || '—');
}

export default function AdminPage({
  db,
  commit,
  refreshRemote,
  adminMembers = [],
  adminMembersStatus = 'idle',
  adminMembersError = '',
  onRefreshMembers
}){
  const[tab,setTab]=useState('overview');
  const[focusUserId,setFocusUserId]=useState(null);
  const deviceCount=(db.pushSubscriptions||[]).filter((row)=>row.active!==false).length;
  const memberCount=adminMembers.length || (db.customers||[]).length;

  function openUserManage(userId=null){
    if(userId)setFocusUserId(userId);
    setTab('uyeler');
  }

  function openCampaign(){
    setTab('kampanya');
  }

  return <section className="pagePro pagePro--admin adminPage">
    <div className="adminPremiumHero">
      <div className="adminHeroBrand">
        <Brand db={db} admin />
        <div>
          <span>{db.settings.cafe_name||STORE_APP_NAME}</span>
          <h2>Yönetim Paneli</h2>
          <p>Liberte Club yönetim merkezi · {memberCount} üye · {deviceCount} bildirim cihazı</p>
        </div>
      </div>
      <div className="adminHeroActions">
        <div className="adminHeroBadge"><ShieldCheck size={16}/> Admin</div>
        <div className="adminHeroQuick">
          <button type="button" className="adminHeroQuickBtn" onClick={openCampaign}>
            <Megaphone size={15}/> Bildirim
          </button>
          <button type="button" className="adminHeroQuickBtn" onClick={()=>openUserManage()}>
            <Users size={15}/> Üyeler
          </button>
        </div>
      </div>
    </div>

    <div className="adminNavPills" role="tablist" aria-label="Yönetim sekmeleri">
      {ADMIN_TABS.map(({id,label,Icon})=>
        <button type="button" key={id} role="tab" aria-selected={tab===id} className={tab===id?'on':''} onClick={()=>setTab(id)}>
          <Icon size={17}/><span>{label}</span>
        </button>
      )}
    </div>

    <div className="adminContent">
      {tab==='overview'&&<OverviewAdmin db={db} commit={commit} onManageUsers={openUserManage}/>}
      {tab==='menu'&&<MenuAdmin db={db} commit={commit}/>}
      {tab==='kampanya'&&<KampanyaAdmin db={db} commit={commit}/>}
      {tab==='uyeler'&&(
        <MembersAdmin
          db={db}
          commit={commit}
          refreshRemote={refreshRemote}
          adminMembers={adminMembers}
          adminMembersStatus={adminMembersStatus}
          adminMembersError={adminMembersError}
          onRefreshMembers={onRefreshMembers}
          focusUserId={focusUserId}
          onFocusHandled={()=>setFocusUserId(null)}
        />
      )}
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
    <PushNotificationAdmin db={db} commit={commit}/>
    <GameAdmin db={db} commit={commit}/>
  </div>;
}

function MembersAdmin({
  db,
  commit,
  refreshRemote,
  adminMembers,
  adminMembersStatus,
  adminMembersError,
  onRefreshMembers,
  focusUserId,
  onFocusHandled
}){
  // Üyeler sekmesi açılınca listeyi yenile
  useEffect(() => {
    onRefreshMembers?.();
  }, [onRefreshMembers]);

  return <div className="adminStack">
    <ReviewApprovalAdmin db={db} commit={commit} refreshRemote={refreshRemote}/>
    <UsersAdmin
      db={db}
      commit={commit}
      adminMembers={adminMembers}
      adminMembersStatus={adminMembersStatus}
      adminMembersError={adminMembersError}
      onRefreshMembers={onRefreshMembers}
      focusUserId={focusUserId}
      onFocusHandled={onFocusHandled}
    />
  </div>;
}

function SettingsAdmin({db,commit}){
  return <div className="adminStack">
    <DesignAdmin db={db} commit={commit}/>
    <CouponsAdmin db={db} commit={commit}/>
    <BackupAdmin db={db}/>
    <ErrorLogsAdmin/>
  </div>;
}

// Veri yedeği — sunucudan tam yedek indir / yedekten geri yükle (PIN doğrulamalı)
function BackupAdmin({ db }){
  const[backups,setBackups]=useState([]);
  const[busy,setBusy]=useState('');
  const[status,setStatus]=useState('');

  // Sunucudaki anlık yedek listesini yükle
  async function loadList(){
    try{
      const list=await fetchBackupList();
      setBackups(list);
    }catch(e){
      setStatus(e.message||'Yedek listesi alınamadı.');
    }
  }

  useEffect(()=>{loadList();},[]);

  // Tam yedeği JSON olarak indir
  async function handleDownload(){
    setBusy('download');setStatus('');
    try{
      await downloadBackup();
      setStatus('Yedek indirildi.');
    }catch(e){
      setStatus(e.message||'Yedek indirilemedi.');
    }finally{setBusy('');}
  }

  // Önbellekten yedek — sunucu kapalıyken
  function handleLocalDownload(){
    setBusy('local');setStatus('');
    try{
      downloadLocalBackup(db);
      setStatus('Önbellek yedeği indirildi (yalnızca bu oturumdaki üye).');
    }catch(e){
      setStatus(e.message||'Önbellek yedeği alınamadı.');
    }finally{setBusy('');}
  }

  function handleAdminSnapshotDownload(){
    setBusy('snapshot');setStatus('');
    try{
      downloadAdminSnapshotBackup();
      setStatus('Tam yönetici yedeği indirildi.');
    }catch(e){
      setStatus(e.message||'Tam yedek alınamadı.');
    }finally{setBusy('');}
  }

  // İndirilen JSON dosyasından geri yükle
  async function handleFileRestore(event){
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file)return;
    if(!window.confirm('Mevcut veriler bu dosyadaki yedekle değiştirilecek. Devam edilsin mi?'))return;
    setBusy('file');setStatus('');
    try{
      await restoreBackupFile(file);
      setStatus('Yedek geri yüklendi. Sayfa yenileniyor...');
      setTimeout(()=>window.location.reload(),1200);
    }catch(e){
      setStatus(e.message||'Geri yükleme başarısız.');
      setBusy('');
    }
  }

  // Sunucudaki anlık yedeği geri yükle
  async function handleSnapshotRestore(id){
    if(!window.confirm('Mevcut veriler bu anlık yedekle değiştirilecek. Devam edilsin mi?'))return;
    setBusy(`snap-${id}`);setStatus('');
    try{
      await restoreBackupSnapshot(id);
      setStatus('Anlık yedek geri yüklendi. Sayfa yenileniyor...');
      setTimeout(()=>window.location.reload(),1200);
    }catch(e){
      setStatus(e.message||'Geri yükleme başarısız.');
      setBusy('');
    }
  }

  return <div className="card adminSectionCard">
    <div className="adminSectionHead"><div><span>YEDEK</span><h3>Veri yedeği & geri yükleme</h3></div><Database size={18}/></div>
    <p className="adminHint">Veriler her değişiklikte sunucuda otomatik yedeklenir. Buradan tam yedeği indirebilir veya bir yedekten geri yükleyebilirsin.</p>

    <div className="adminBackupActions">
      <button type="button" className="goldBtn" disabled={busy==='download'} onClick={handleDownload}>
        <Download size={16}/> {busy==='download'?'İndiriliyor...':'Sunucudan indir'}
      </button>
      <button type="button" className="ghost" disabled={busy==='snapshot'} onClick={handleAdminSnapshotDownload}>
        <Database size={16}/> {busy==='snapshot'?'Hazırlanıyor...':'Tam yedek (önbellek)'}
      </button>
      <button type="button" className="ghost" disabled={busy==='local'} onClick={handleLocalDownload}>
        <Smartphone size={16}/> {busy==='local'?'Hazırlanıyor...':'Önbellekten indir'}
      </button>
      <label className="ghost adminBackupUpload">
        <UploadCloud size={16}/> {busy==='file'?'Yükleniyor...':'Dosyadan geri yükle'}
        <input type="file" accept="application/json" hidden disabled={busy==='file'} onChange={handleFileRestore}/>
      </label>
    </div>

    {status&&<p className="adminBackupStatus">{status}</p>}

    {backups.length>0&&<div className="adminBackupList">
      <h4>Otomatik anlık yedekler</h4>
      {backups.map(b=>
        <div className="adminBackupRow" key={b.id}>
          <div>
            <b>{new Date(b.createdAt).toLocaleString('tr-TR')}</b>
            <small>{b.customerCount} üye · {b.reason==='pre-delete'?'silme öncesi':'otomatik'}</small>
          </div>
          <button type="button" className="ghost" disabled={busy===`snap-${b.id}`} onClick={()=>handleSnapshotRestore(b.id)}>
            <RotateCcw size={14}/> Geri yükle
          </button>
        </div>
      )}
    </div>}
  </div>;
}
function OverviewAdmin({db,commit,onManageUsers}){
  const customers=db.customers||[];
  const loyalty=db.loyalty||{};
  const history=db.history||[];
  const totalLp=Object.values(loyalty).reduce((a,l)=>a+(getLpBalance(l)||0),0);
  const activeRewards=Object.values(loyalty).reduce((a,l)=>a+getRedeemableRewards(l).length,0);
  const pushGranted=(db.pushSubscriptions||[]).filter(s=>s.active!==false&&s.permissionStatus==='granted').length;
  const today=new Date().toLocaleDateString('tr-TR');
  const todayEvents=history.filter(h=>String(h.createdAt||'').startsWith(today)).length;
  const todaySignups=customers.filter(c=>String(c.createdAt||'').startsWith(today)).length;
  const activeCoupons=(db.coupons||[]).filter(c=>c.active!==false).length;
  const activeCampaigns=(db.campaigns||[]).filter(c=>c.active!==false).length+(db.dailyCampaign?.active!==false?1:0);
  const menuItemCount=(db.items||[]).length;
  const topCustomers=[...customers]
    .map(c=>({c,l:loyalty[c.id]||loyaltyTemplate(c.id)}))
    .sort((a,b)=>(getLpBalance(b.l)||0)-(getLpBalance(a.l)||0))
    .slice(0,5);

  const historyLabel=(t)=>historyTypeLabel(t);

  return <div className="analyticsPage adminOverview">
    <div className="adminSectionHead adminOverviewHead">
      <div><span>ÖZET</span><h3>İşletme durumu</h3></div>
      <p className="adminOverviewDate">{today}</p>
    </div>

    <div className="analyticsGrid adminMetricsCompact adminMetricsPremium">
      <div className="metricCard"><span>Toplam Üye</span><b>{customers.length}</b><small>Kayıtlı</small></div>
      <div className="metricCard"><span>Bugünkü Kayıt</span><b>{todaySignups}</b><small>Yeni üye</small></div>
      <div className="metricCard"><span>Toplam LP</span><b>{totalLp}</b><small>Bakiye</small></div>
      <div className="metricCard"><span>Ödül</span><b>{activeRewards}</b><small>Kullanılabilir</small></div>
      <div className="metricCard"><span>Aktif Kupon</span><b>{activeCoupons}</b><small>Promosyon</small></div>
      <div className="metricCard"><span>Aktif Kampanya</span><b>{activeCampaigns}</b><small>Yayında</small></div>
      <div className="metricCard"><span>Menü Ürün</span><b>{menuItemCount}</b><small>Ürün</small></div>
      <div className="metricCard"><span>Push Cihaz</span><b>{pushGranted}</b><small>İzinli</small></div>
      <div className="metricCard"><span>Bugün</span><b>{todayEvents}</b><small>İşlem</small></div>
    </div>

    <UserManageOverview db={db} commit={commit} onManageUsers={onManageUsers}/>

    <div className="card topMembers adminSectionCard">
      <h3>En sadık üyeler</h3>
      {topCustomers.length?topCustomers.map(({c,l},i)=>
        <div className="topMember" key={c.id}>
          <span>{i+1}</span>
          <div>
            <b>{c.name}</b>
            <p>{l.level||'Bronze'} · {getLpBalance(l)} LP · {getRedeemableRewards(l).length} ödül</p>
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
          <strong>{h.type==='reward_redeem'||h.type==='lp_reward_redeem'?`${h.count||0} LP`:(h.count>0?`+${h.count} LP`:h.count||'•')}</strong>
        </div>
      )}
      {!history.length&&<div className="empty">Henüz işlem yok.</div>}
    </div>
  </div>;
}

// Özet ekranında hızlı kullanıcı yönetimi
function UserManageOverview({db,commit,onManageUsers}){
  const[query,setQuery]=useState('');
  const customers=db.customers||[];
  const loyalty=db.loyalty||{};
  const needle=query.trim().toLowerCase();
  const filtered=customers.filter(c=>{
    if(!needle)return true;
    return String(c.name||'').toLowerCase().includes(needle)
      ||String(c.phone||'').includes(needle)
      ||String(c.email||'').toLowerCase().includes(needle);
  }).slice(0,8);

  function addStamp(c){
    commit(addStampToCustomer(db,c.id,1,'Admin özet'));
  }

  return <div className="card adminSectionCard userManageOverview">
    <div className="adminSectionHead">
      <div><span>ÜYELER</span><h3>Kullanıcı yönetimi</h3></div>
      <button type="button" className="ghost adminExportBtn" onClick={()=>onManageUsers()}><Users size={16}/> Tümünü yönet</button>
    </div>
    <p className="pushHint">Telefon ve e-posta tekil tutulur. Arama yapıp hızlı işlem alabilir veya tam listeye geçebilirsin.</p>
    <input
      placeholder="İsim, telefon veya e-posta ara"
      value={query}
      onChange={e=>setQuery(e.target.value)}
    />
    {filtered.length?filtered.map(c=>{
      const l=loyalty[c.id]||loyaltyTemplate(c.id);
      const lpBalance=getLpBalance(l);
      const rewards=getRedeemableRewards(l).length;
      return <div className="historyMini userManageRow" key={c.id}>
        <div className="userManageRowMain">
          <b>{c.name}</b>
          <span className="userManageRowPhone">{displayMemberPhone(c.phone)}</span>
          <p>{c.email||'mail yok'} · {lpBalance} LP · {rewards} ödül</p>
        </div>
        <div className="userManageRowActions">
          <button type="button" className="ghost" onClick={()=>addStamp(c)}><Plus size={14}/></button>
          <button type="button" onClick={()=>onManageUsers(c.id)}>Düzenle</button>
        </div>
      </div>;
    }):<div className="empty">Eşleşen kullanıcı yok.</div>}
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
    best:false,
    active:true,
    inStock:true
  };

  const[f,setF]=useState(blank);
  const[query,setQuery]=useState('');
  const[categoryFilter,setCategoryFilter]=useState('all');
  const[statusFilter,setStatusFilter]=useState('all');
  const[editId,setEditId]=useState(null);
  const[editForm,setEditForm]=useState(null);
  const[pendingDelete,setPendingDelete]=useState(null);

  function categoryName(categoryId){
    return db.categories.find(c=>c.id===categoryId)?.name||'—';
  }

  function matchesFilters(item){
    if(categoryFilter!=='all'&&Number(item.categoryId)!==Number(categoryFilter))return false;
    const isActive=item.active!==false;
    if(statusFilter==='active'&&!isActive)return false;
    if(statusFilter==='passive'&&isActive)return false;
    if(!query.trim())return true;
    const needle=query.trim().toLowerCase();
    return String(item.name||'').toLowerCase().includes(needle)
      ||String(item.description||'').toLowerCase().includes(needle);
  }

  async function onFile(e,isEdit=false){
    const file=e.target.files?.[0];
    if(!file)return;
    const url=await fileToDataUrl(file);
    if(isEdit)setEditForm(prev=>({...prev,imageUrl:url}));
    else setF({...f,imageUrl:url});
  }

  function saveItem(){
    if(!f.name||!f.price)return alert('Ürün adı ve fiyat zorunlu.');
    commit({...db,items:[...db.items,{
      ...f,
      id:Date.now(),
      price:Number(f.price),
      active:f.active!==false,
      inStock:f.inStock!==false
    }]});
    setF(blank);
  }

  function startEdit(item){
    setEditId(item.id);
    setEditForm({
      name:item.name||'',
      price:item.price||'',
      description:item.description||'',
      categoryId:item.categoryId,
      image:item.image||'☕',
      imageUrl:item.imageUrl||'',
      tone:item.tone||'#b9f5d0',
      featured:!!item.featured,
      best:!!item.best,
      active:item.active!==false,
      inStock:item.inStock!==false
    });
  }

  function saveEdit(){
    if(!editForm?.name||!editForm?.price)return alert('Ürün adı ve fiyat zorunlu.');
    commit({...db,items:db.items.map(i=>i.id===editId?{
      ...i,
      ...editForm,
      price:Number(editForm.price),
      active:editForm.active!==false,
      inStock:editForm.inStock!==false
    }:i)});
    setEditId(null);
    setEditForm(null);
  }

  function executeDelete(){
    if(!pendingDelete)return;
    commit({...db,items:db.items.filter(x=>x.id!==pendingDelete.id)});
    setPendingDelete(null);
    if(editId===pendingDelete.id){
      setEditId(null);
      setEditForm(null);
    }
  }

  const filtered=db.items.filter(matchesFilters);

  return <div className="adminStack">
    <div className="card adminSectionCard adminMenuCard">
      <div className="adminSectionHead">
        <div><span>MENÜ</span><h3>Ürün Ekle</h3></div>
      </div>
      <p className="adminHint">Yeni ürün ekle; kategori, fiyat ve görseli buradan yönet.</p>

      <div className="adminItemForm">
        <input placeholder="Ürün adı" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/>
        <input placeholder="Fiyat" type="number" value={f.price} onChange={e=>setF({...f,price:e.target.value})}/>
        <textarea placeholder="Açıklama" value={f.description} onChange={e=>setF({...f,description:e.target.value})}/>
        <select value={f.categoryId} onChange={e=>setF({...f,categoryId:Number(e.target.value)})}>
          {db.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input placeholder="Emoji" value={f.image} onChange={e=>setF({...f,image:e.target.value})} aria-label="Ürün emoji"/>
        <label className="file">
          <UploadCloud/> Görsel yükle
          <input type="file" accept="image/*" onChange={onFile}/>
        </label>
        <label className="adminToggle"><input type="checkbox" checked={f.active!==false} onChange={e=>setF({...f,active:e.target.checked})}/><span>Aktif</span></label>
        <label className="adminToggle"><input type="checkbox" checked={f.inStock!==false} onChange={e=>setF({...f,inStock:e.target.checked})}/><span>Stokta var</span></label>
        <button type="button" onClick={saveItem}><Plus/> Ürün ekle</button>
      </div>
    </div>

    <div className="card adminSectionCard adminMenuCard">
      <div className="adminSectionHead">
        <div><span>MENÜ</span><h3>Ürün Listesi</h3></div>
      </div>

      <input
        className="adminCategorySearch"
        placeholder="Ürün ara…"
        value={query}
        onChange={e=>setQuery(e.target.value)}
      />

      <div className="adminItemFilters">
        <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} aria-label="Kategori filtresi">
          <option value="all">Tüm kategoriler</option>
          {db.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Durum filtresi">
          <option value="all">Tümü</option>
          <option value="active">Aktif</option>
          <option value="passive">Pasif</option>
        </select>
      </div>

      <div className="adminPremiumList">
        {filtered.length?filtered.map(item=>{
          const isEditing=editId===item.id;
          const isActive=item.active!==false;
          const inStock=item.inStock!==false;
          return <div className="adminPremiumRow adminItemRow" key={item.id}>
            <div className="adminPremiumRowMain">
              <span className="adminPremiumBadge" aria-hidden="true">{item.image||'☕'}</span>
              <div className="adminPremiumRowMeta">
                {isEditing?(
                  <div className="adminItemEditGrid">
                    <input value={editForm.name} onChange={e=>setEditForm({...editForm,name:e.target.value})} placeholder="Ürün adı"/>
                    <input type="number" value={editForm.price} onChange={e=>setEditForm({...editForm,price:e.target.value})} placeholder="Fiyat"/>
                    <textarea value={editForm.description} onChange={e=>setEditForm({...editForm,description:e.target.value})} placeholder="Açıklama"/>
                    <select value={editForm.categoryId} onChange={e=>setEditForm({...editForm,categoryId:Number(e.target.value)})}>
                      {db.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input value={editForm.image} onChange={e=>setEditForm({...editForm,image:e.target.value})} placeholder="Emoji" aria-label="Düzenle emoji"/>
                    <label className="file adminItemFile">
                      <UploadCloud size={14}/> Görsel
                      <input type="file" accept="image/*" onChange={e=>onFile(e,true)}/>
                    </label>
                    <label className="adminToggle adminToggle--onDark"><input type="checkbox" checked={editForm.active!==false} onChange={e=>setEditForm({...editForm,active:e.target.checked})}/><span>Aktif</span></label>
                    <label className="adminToggle adminToggle--onDark"><input type="checkbox" checked={editForm.inStock!==false} onChange={e=>setEditForm({...editForm,inStock:e.target.checked})}/><span>Stokta</span></label>
                  </div>
                ):(
                  <>
                    <strong>{item.name}</strong>
                    <small>
                      {categoryName(item.categoryId)} · {money(item.price)}
                      · {isActive?'Aktif':'Pasif'} · {inStock?'Stokta':'Tükendi'}
                    </small>
                    {item.description&&<small className="adminItemDesc">{item.description}</small>}
                  </>
                )}
              </div>
            </div>
            <div className="adminCategoryActions">
              {isEditing?(
                <>
                  <button type="button" className="ghost" onClick={()=>{setEditId(null);setEditForm(null);}}>İptal</button>
                  <button type="button" onClick={saveEdit}>Kaydet</button>
                </>
              ):(
                <>
                  <button type="button" className="ghost" aria-label="Düzenle" onClick={()=>startEdit(item)}><Edit2 size={16}/></button>
                  <button type="button" className="danger" aria-label="Sil" onClick={()=>setPendingDelete(item)}><Trash2 size={16}/></button>
                </>
              )}
            </div>
          </div>;
        }):<div className="empty">Eşleşen ürün yok.</div>}
      </div>

      {pendingDelete&&(
        <AdminConfirmModal
          title="Ürünü sil"
          message={`"${pendingDelete.name}" ürününü silmek istediğine emin misin?`}
          onCancel={()=>setPendingDelete(null)}
          onConfirm={executeDelete}
        />
      )}
    </div>
  </div>;
}

function CategoryAdmin({db,commit}){
  const[name,setName]=useState('');
  const[icon,setIcon]=useState('✨');
  const[query,setQuery]=useState('');
  const[editId,setEditId]=useState(null);
  const[editName,setEditName]=useState('');
  const[editIcon,setEditIcon]=useState('');
  const[pendingDelete,setPendingDelete]=useState(null);

  function add(){
    if(!name.trim())return;
    commit({...db,categories:[...db.categories,{id:Date.now(),name:name.trim(),icon,description:'',active:true}]});
    setName('');
  }

  function startEdit(category){
    setEditId(category.id);
    setEditName(category.name);
    setEditIcon(category.icon||'✨');
  }

  function saveEdit(){
    if(!editName.trim())return;
    commit({...db,categories:db.categories.map(c=>c.id===editId?{...c,name:editName.trim(),icon:editIcon}:c)});
    setEditId(null);
  }

  function confirmDelete(category){
    setPendingDelete(category);
  }

  function executeDelete(){
    if(!pendingDelete)return;
    const fallbackId=db.categories.find(c=>c.id!==pendingDelete.id)?.id||1;
    commit({
      ...db,
      categories:db.categories.filter(x=>x.id!==pendingDelete.id),
      items:db.items.map(i=>i.categoryId===pendingDelete.id?{...i,categoryId:fallbackId}:i)
    });
    setPendingDelete(null);
  }

  const filtered=db.categories.filter(c=>{
    if(!query.trim())return true;
    const needle=query.trim().toLowerCase();
    return String(c.name||'').toLowerCase().includes(needle);
  });

  return <div className="card adminSectionCard adminMenuCard">
    <div className="adminSectionHead">
      <div><span>MENÜ</span><h3>Kategori Yönetimi</h3></div>
    </div>
    <p className="adminHint">Kategorileri düzenle, ürün sayısını gör ve silmeden önce onay iste.</p>

    <div className="formRow adminCategoryForm">
      <input placeholder="Kategori adı" value={name} onChange={e=>setName(e.target.value)}/>
      <input placeholder="İkon" value={icon} onChange={e=>setIcon(e.target.value)} aria-label="Kategori ikonu"/>
      <button type="button" onClick={add}><Plus/> Ekle</button>
    </div>

    <input
      className="adminCategorySearch"
      placeholder="Kategori ara…"
      value={query}
      onChange={e=>setQuery(e.target.value)}
    />

    <div className="adminCategoryList">
      {filtered.length?filtered.map(c=>{
        const itemCount=db.items.filter(i=>i.categoryId===c.id).length;
        const isEditing=editId===c.id;
        return <div className="adminCategoryCard" key={c.id}>
          <div className="adminCategoryCardMain">
            <span className="adminCategoryIcon" aria-hidden="true">{c.icon||'✨'}</span>
            <div className="adminCategoryMeta">
              {isEditing?(
                <div className="adminCategoryEditRow">
                  <input value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Kategori adı"/>
                  <input value={editIcon} onChange={e=>setEditIcon(e.target.value)} placeholder="İkon" aria-label="Düzenle ikon"/>
                </div>
              ):(
                <>
                  <strong>{c.name}</strong>
                  <small>{itemCount} ürün · {c.active===false?'Pasif':'Aktif'}</small>
                </>
              )}
            </div>
          </div>
          <div className="adminCategoryActions">
            {isEditing?(
              <>
                <button type="button" className="ghost" onClick={()=>setEditId(null)}>İptal</button>
                <button type="button" onClick={saveEdit}>Kaydet</button>
              </>
            ):(
              <>
                <button type="button" className="ghost" aria-label="Düzenle" onClick={()=>startEdit(c)}><Edit2 size={16}/></button>
                <button type="button" className="danger" aria-label="Sil" onClick={()=>confirmDelete(c)}><Trash2 size={16}/></button>
              </>
            )}
          </div>
        </div>;
      }):<div className="empty">Eşleşen kategori yok.</div>}
    </div>

    {pendingDelete&&(
      <AdminConfirmModal
        title="Kategoriyi sil"
        message={`"${pendingDelete.name}" kategorisini silmek istediğine emin misin?`}
        onCancel={()=>setPendingDelete(null)}
        onConfirm={executeDelete}
      />
    )}
  </div>;
}

// Silme onay modalı — admin panel genel kullanım
function AdminConfirmModal({title,message,onCancel,onConfirm}){
  return <div className="adminConfirmBackdrop" role="dialog" aria-modal="true">
    <div className="adminConfirmCard">
      <h4>{title}</h4>
      <p>{message}</p>
      <div className="adminConfirmActions">
        <button type="button" className="ghost" onClick={onCancel}>İptal</button>
        <button type="button" className="danger" onClick={onConfirm}>Sil</button>
      </div>
    </div>
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
  const[title,setTitle]=useState('Bonus LP');
  const[value,setValue]=useState(1);
  const[type,setType]=useState('stamp');
  const[query,setQuery]=useState('');
  const[pendingDelete,setPendingDelete]=useState(null);
  const coupons=db.coupons||[];

  function createCoupon(){
    const clean=String(code||'').trim().toUpperCase();
    if(clean.length<3)return alert('Kupon kodu en az 3 karakter olmalı.');
    if(coupons.some(c=>String(c.code||'').toUpperCase()===clean))return alert('Bu kupon kodu zaten var.');
    commit({...db,coupons:[{id:Date.now(),code:clean,title,rewardType:type,rewardValue:Number(value||1),active:true,createdAt:new Date().toLocaleString('tr-TR')},...coupons]});
    setCode('');
  }

  function toggleCoupon(id){
    commit({...db,coupons:coupons.map(c=>c.id===id?{...c,active:!c.active}:c)});
  }

  function executeDelete(){
    if(!pendingDelete)return;
    commit({...db,coupons:coupons.filter(c=>c.id!==pendingDelete.id)});
    setPendingDelete(null);
  }

  const filtered=coupons.filter(c=>{
    if(!query.trim())return true;
    const needle=query.trim().toLowerCase();
    return String(c.code||'').toLowerCase().includes(needle)
      ||String(c.title||'').toLowerCase().includes(needle);
  });

  return <div className="card adminSectionCard adminCouponCard">
    <div className="adminSectionHead"><div><span>KUPON</span><h3>Promosyon kodları</h3></div></div>
    <p className="adminHint">Kupon kodları üyelere LP veya ikram tanımlar. Silmeden önce onay istenir.</p>

    <div className="adminCouponForm">
      <input placeholder="Örn: LIBERTE20" value={code} onChange={e=>setCode(e.target.value)}/>
      <input placeholder="Kupon başlığı" value={title} onChange={e=>setTitle(e.target.value)}/>
      <select value={type} onChange={e=>setType(e.target.value)}>
        <option value="stamp">LP ver</option>
        <option value="reward">İkram (7 LP) ver</option>
      </select>
      <input type="number" min="1" value={value} onChange={e=>setValue(e.target.value)} aria-label="Ödül miktarı"/>
      <button type="button" onClick={createCoupon}><Plus/> Kupon oluştur</button>
    </div>

    <input
      className="adminCategorySearch"
      placeholder="Kupon kodu veya başlık ara…"
      value={query}
      onChange={e=>setQuery(e.target.value)}
    />

    <div className="adminPremiumList">
      {filtered.length?filtered.map(c=>{
        const usageCount=(db.history||[]).filter(h=>h.type==='coupon'&&String(h.source||'').includes(c.code)).length;
        return <div className="adminPremiumRow" key={c.id}>
          <div className="adminPremiumRowMain">
            <span className="adminPremiumBadge" aria-hidden="true">🎟️</span>
            <div className="adminPremiumRowMeta">
              <strong>{c.code}</strong>
              <small>{c.title} · {c.rewardType==='reward'?'İkram':'LP'} +{c.rewardValue} · {c.active===false?'Pasif':'Aktif'} · {usageCount} kullanım</small>
            </div>
          </div>
          <div className="adminCategoryActions">
            <button type="button" className={c.active===false?'danger':'ghost'} onClick={()=>toggleCoupon(c.id)}>{c.active===false?'Pasif':'Aktif'}</button>
            <button type="button" className="danger" aria-label="Sil" onClick={()=>setPendingDelete(c)}><Trash2 size={16}/></button>
          </div>
        </div>;
      }):<div className="empty">Eşleşen kupon yok.</div>}
    </div>

    {pendingDelete&&(
      <AdminConfirmModal
        title="Kuponu sil"
        message={`"${pendingDelete.code}" kuponunu silmek istediğine emin misin?`}
        onCancel={()=>setPendingDelete(null)}
        onConfirm={executeDelete}
      />
    )}
  </div>;
}

function GameAdmin({db,commit}){
  const c=db.dailyCampaign||seed.dailyCampaign;
  const[form,setForm]=useState({title:c.title||'',body:c.body||'',emoji:c.emoji||'🔥',active:c.active!==false});
  const[prizes,setPrizes]=useState(db.wheelPrizes||seed.wheelPrizes);
  const[notifyOnSave,setNotifyOnSave]=useState(false);
  const[campaigns,setCampaigns]=useState(db.campaigns||seed.campaigns);
  const[campaignNotify,setCampaignNotify]=useState(false);
  const[wheelUnlimited,setWheelUnlimited]=useState(db.settings?.wheel_unlimited===true);

  async function saveCampaign(){
    const next={...db,dailyCampaign:{...c,...form,updatedAt:new Date().toLocaleString('tr-TR')}};
    commit(next);
    if(notifyOnSave&&form.active){
      const title=`${form.emoji||'🔥'} ${form.title||'Yeni kampanya'}`;
      const result=await dispatchPush(next,commit,{title,body:form.body||'Liberte Club fırsatını kaçırma.'});
      alert(result.note);
    }
  }

  function savePrizes(){
    commit({
      ...db,
      settings:{...db.settings,wheel_unlimited:wheelUnlimited},
      wheelPrizes:prizes.map((p,i)=>({...p,id:p.id||Date.now()+i,weight:Number(p.weight||1),value:Number(p.value||0)}))
    });
  }

  async function saveCampaigns(){
    const next={...db,campaigns:campaigns.map((x,i)=>({...x,id:x.id||Date.now()+i}))};
    commit(next);
    const active=campaigns.filter(x=>x.active!==false);
    if(campaignNotify&&active.length){
      const latest=active[active.length-1];
      const title=`${latest.emoji||'🎁'} ${latest.title||'Yeni kampanya'}`;
      const result=await dispatchPush(next,commit,{title,body:latest.body||'Liberte Club\'da yeni fırsat var.'});
      alert(result.note);
    }
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
      <label className="adminToggle"><input type="checkbox" checked={notifyOnSave} onChange={e=>setNotifyOnSave(e.target.checked)}/><span>Kaydedince push bildirimi gönder</span></label>
      <button type="button" onClick={saveCampaign}><ShieldCheck/> Kaydet</button>
    </div>

    <div className="card adminSectionCard">
      <div className="adminSectionHead"><div><span>LİSTE</span><h3>Uygulama kampanyaları</h3></div></div>
      <p className="adminHint">Kampanyalar uygulama içinde listelenir. Kayıt sonrası isteğe bağlı push gönderilebilir.</p>
      <div className="adminPremiumList">
      {campaigns.map((item,i)=><div className="adminPremiumRow adminCampaignRow" key={item.id||i}>
        <div className="adminPremiumRowMain adminCampaignFields">
          <span className="adminPremiumBadge" aria-hidden="true">{item.emoji||'🎁'}</span>
          <div className="adminCampaignInputs">
            <input value={item.title||''} onChange={e=>setCampaigns(campaigns.map((x,n)=>n===i?{...x,title:e.target.value}:x))} placeholder="Başlık"/>
            <input value={item.body||''} onChange={e=>setCampaigns(campaigns.map((x,n)=>n===i?{...x,body:e.target.value}:x))} placeholder="Açıklama"/>
            <input value={item.emoji||''} onChange={e=>setCampaigns(campaigns.map((x,n)=>n===i?{...x,emoji:e.target.value}:x))} placeholder="Emoji" aria-label="Kampanya emoji"/>
          </div>
        </div>
        <label className="adminToggle inline"><input type="checkbox" checked={item.active!==false} onChange={e=>setCampaigns(campaigns.map((x,n)=>n===i?{...x,active:e.target.checked}:x))}/><span>{item.active!==false?'Aktif':'Pasif'}</span></label>
      </div>)}
      </div>
      <button type="button" className="ghost" onClick={()=>setCampaigns([...campaigns,{id:Date.now(),title:'Yeni kampanya',body:'Detayları uygulamada gör.',active:true,emoji:'🎁'}])}><Plus/> Kampanya ekle</button>
      <label className="adminToggle"><input type="checkbox" checked={campaignNotify} onChange={e=>setCampaignNotify(e.target.checked)}/><span>Kaydedince üyelere bildir</span></label>
      <button type="button" onClick={saveCampaigns}><Send/> Kampanyaları kaydet</button>
    </div>

    <div className="card adminSectionCard">
      <div className="adminSectionHead"><div><span>ÇARK</span><h3>Şans çarkı ödülleri</h3></div></div>
      {prizes.map((p,i)=><div className="prizeEdit" key={p.id||i}>
        <input value={p.label} onChange={e=>setPrizes(prizes.map((x,n)=>n===i?{...x,label:e.target.value}:x))}/>
        <select value={p.type} onChange={e=>setPrizes(prizes.map((x,n)=>n===i?{...x,type:e.target.value}:x))}>
          <option value="stamp">LP</option>
          <option value="reward">İkram (7 LP)</option>
          <option value="lp">LP (doğrudan)</option>
          <option value="message">Mesaj</option>
        </select>
        <input type="number" value={p.value} onChange={e=>setPrizes(prizes.map((x,n)=>n===i?{...x,value:e.target.value}:x))}/>
        <input type="number" value={p.weight} onChange={e=>setPrizes(prizes.map((x,n)=>n===i?{...x,weight:e.target.value}:x))}/>
      </div>)}
      <button type="button" className="ghost" onClick={()=>setPrizes([...prizes,{id:Date.now(),label:'+1 LP',type:'stamp',value:1,weight:10}])}><Plus/> Ödül ekle</button>
      <label className="adminToggle"><input type="checkbox" checked={wheelUnlimited} onChange={e=>setWheelUnlimited(e.target.checked)}/><span>Tüm üyeler için sınırsız çark</span></label>
      <p className="pushHint">Admin hesapları her zaman sınırsız çevirebilir.</p>
      <button type="button" onClick={savePrizes}><ShieldCheck/> Çarkı kaydet</button>
    </div>
  </div>;
}


function UsersAdmin({
  db,
  commit,
  adminMembers = [],
  adminMembersStatus = 'idle',
  adminMembersError = '',
  onRefreshMembers,
  focusUserId,
  onFocusHandled
}){
  const[editing,setEditing]=useState(null);
  const[form,setForm]=useState({name:'',phone:'',email:'',birthDate:'',isAdmin:false,note:''});
  const[message,setMessage]=useState('');
  const[query,setQuery]=useState('');
  const[pendingDelete,setPendingDelete]=useState(null);
  const[lpProductPick,setLpProductPick]=useState(null);

  const customers=adminMembers.length ? adminMembers : (db.customers || []);
  const needle=query.trim().toLowerCase();
  const filtered=customers.filter(c=>{
    if(!needle)return true;
    return String(c.name||'').toLowerCase().includes(needle)
      ||String(c.phone||'').includes(needle)
      ||String(c.email||'').toLowerCase().includes(needle);
  });

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

  useEffect(()=>{
    if(!focusUserId)return;
    const target=customers.find(c=>c.id===focusUserId);
    if(target){
      beginEdit(target);
      onFocusHandled?.();
    }
  },[focusUserId]);

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
    setPendingDelete(c);
  }

  async function executeDeleteUser(){
    if(!pendingDelete)return;
    const c=pendingDelete;
    setMessage('');

    try{
      if(!useLocalAuth()){
        await deleteAdminMember(c.id);
      }

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
      }, { skipRemote: useLocalAuth() ? false : true });

      setEditing(null);
      setPendingDelete(null);
      setMessage('Kullanıcı silindi.');
    }catch(error){
      setMessage(error?.message||'Kullanıcı silinemedi.');
      setPendingDelete(null);
    }
  }

  function addCategory(c,category,menuItem=null){
    const next=addCategoryStampToCustomer(db,c.id,category,1,'Admin manuel',menuItem);
    if(next===db){
      setMessage('LP eklenemedi. Burger için ürün seç ve Patates Tabağı LP kazanmaz.');
      return;
    }
    commit(next);
    setMessage(menuItem?.name ? `${menuItem.name} için LP eklendi.` : 'LP eklendi.');
  }

  function requestAddCategory(c,category){
    if(requiresProductPickForLpCategory(category, db.items||[])){
      setLpProductPick({ customer:c, category });
      return;
    }
    addCategory(c,category);
  }

  function handleLpProductPick(item){
    if(!lpProductPick)return;
    const check=assertMenuItemCanEarnLp(item);
    if(!check.ok){
      setMessage(check.error);
      setLpProductPick(null);
      return;
    }
    addCategory(lpProductPick.customer, check.category, item);
    setLpProductPick(null);
  }

  function removeCategory(c,category){
    commit(addCategoryStampToCustomer(db,c.id,category,-1,'Admin düzeltme'));
  }

  function redeemCategory(c,category){
    const cat=STAMP_CATEGORIES.find(x=>x.id===category);
    const catLabel=cat?.label||category;
    const ok=confirm(`${c.name} için ${cat?.rewardLabel || catLabel} ödülü (${cat?.rewardCost || 0} LP) kullanılsın mı?`);
    if(!ok)return;
    commit(redeemCategoryRewardForCustomer(db,c.id,category,'Admin manuel'));
  }

  return <div className="adminMemberPanel">
    <div className="card adminSectionCard userAdminIntro">
      <div className="adminSectionHead"><div><span>ÜYELER</span><h3>Üye ayarları</h3></div></div>
      <p className="adminHint">Telefon ve e-posta tekil tutulur. Arama yapıp üye detayına geçebilirsin.</p>
      {adminMembersStatus === 'loading' && <p className="adminHint">Üyeler yükleniyor…</p>}
      {adminMembersStatus === 'error' && adminMembersError && (
        <p className="adminPinError">
          {adminMembersError}
          {' '}
          <button type="button" className="ghost adminPinSkip" onClick={() => onRefreshMembers?.()}>Tekrar dene</button>
        </p>
      )}
      {message&&<p className="info">{message}</p>}
      <input
        className="adminCategorySearch"
        placeholder="İsim, telefon veya e-posta ara…"
        value={query}
        onChange={e=>setQuery(e.target.value)}
      />
    </div>

    {!filtered.length && adminMembersStatus === 'ready' && (
      <div className="empty">Kayıtlı üye bulunamadı.</div>
    )}

    {filtered.map(c=>{
      const l=db.loyalty[c.id]||loyaltyTemplate(c.id);
      const lpBalance=getLpBalance(l);
      const redeemableCount=getRedeemableRewards(l).length;
      const isEdit=editing===c.id;

      const pushRow=(db.pushSubscriptions||[]).find(s=>s.customerId===c.id&&s.active!==false);
      const pushLabel=pushRow?.permissionStatus==='granted'?'Bildirim açık':pushRow?'Bildirim kapalı':'Cihaz yok';

      return <div className={isEdit?'card adminMemberCard editing':'card adminMemberCard'} key={c.id}>
        {!isEdit? <>
          <div className="adminMemberCardHead">
            <div className="adminPremiumRowMain">
              <span className="adminPremiumBadge" aria-hidden="true">{c.isAdmin?'🛡️':'👤'}</span>
              <div className="adminPremiumRowMeta adminMemberIdentity">
                <strong className="adminMemberName">{c.name || 'İsimsiz'}</strong>
                <span className="adminMemberPhone">{displayMemberPhone(c.phone)}</span>
                <small className="adminMemberMeta">
                  {c.email || 'e-posta yok'} · {c.isAdmin ? 'Admin' : 'Müşteri'} · {pushLabel}
                </small>
              </div>
            </div>
            <div className="adminCategoryActions">
              <button type="button" className="ghost" aria-label="Düzenle" onClick={()=>beginEdit(c)}><Edit2 size={16}/></button>
              <button type="button" className="danger" aria-label="Sil" onClick={()=>deleteUser(c)}><Trash2 size={16}/></button>
            </div>
          </div>

          <div className="adminMemberStats">
            <span><em>LP</em><b>{lpBalance}</b></span>
            <span><em>Ödül</em><b>{redeemableCount}</b></span>
            <span><em>Seviye</em><b>{l.level||'Bronze'}</b></span>
            <span><em>Kayıt</em><b>{c.createdAt||'—'}</b></span>
          </div>

          <p className="adminMemberRef">Referans: <b>{getReferralCode(c)}</b></p>
          {(db.customerNotes||{})[c.id]&&<p className="customerNote">Not: {(db.customerNotes||{})[c.id]}</p>}

          <StampCategoryPanel
            mode="admin"
            lpBalance={lpBalance}
            onAdd={(category)=>requestAddCategory(c,category)}
            onRemove={(category)=>removeCategory(c,category)}
            onRedeem={(category)=>redeemCategory(c,category)}
          />

          <div className="userActions wide">
            <button className="ghost" onClick={()=>beginEdit(c)}>Profil düzenle</button>
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

    {!filtered.length&&<div className="empty">Eşleşen üye yok.</div>}

    {pendingDelete&&(
      <AdminConfirmModal
        title="Üyeyi sil"
        message={`${pendingDelete.name} silinsin mi? LP ve ödül kayıtları da kaldırılır.`}
        onCancel={()=>setPendingDelete(null)}
        onConfirm={executeDeleteUser}
      />
    )}

    {lpProductPick && (
      <CashierProductPickModal
        lpCategory={lpProductPick.category}
        menuItems={db.items || []}
        onSelect={handleLpProductPick}
        onClose={() => setLpProductPick(null)}
      />
    )}
  </div>;
}
