import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { QRCodeCanvas } from "qrcode.react";
import "./style.css";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCDWpSpPoEsMirO0Grbpbabaju7QALVERC",
  authDomain: "liberte-club.firebaseapp.com",
  projectId: "liberte-club",
  storageBucket: "liberte-club.firebasestorage.app",
  messagingSenderId: "605225271131",
  appId: "1:605225271131:web:d03f217cfd9445a193e47e",
  measurementId: "G-HRKRV78XGS",
};

const VAPID_KEY = import.meta.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";

const links = {
  instagram: "https://www.instagram.com/gastroliberte",
  googleReview: "https://www.google.com/search?q=Liberte+Gastro+Cafe+Sakarya+yorum",
  maps: "https://www.google.com/maps/search/?api=1&query=Liberte+Gastro+Cafe+Serdivan+Sakarya",
  yemeksepeti: "https://www.yemeksepeti.com/restaurant/x9yt/liberte-gastro-cafe",
  menu: "https://liberte.adisyonqr.com/",
};

const seed = {
  settings: {
    app_name: "Liberte Club",
    cafe_name: "Liberte Gastro Cafe",
    logo: "",
    bg: "#06110d",
    card: "#102219",
    accent: "#b9f5d0",
    stamp_threshold: 10,
    reward_description: "1 Bedava İçecek",
    hero_title: "Liberte ayrıcalıkları cebinde.",
    hero_subtitle: "QR kartını göster, damgalarını topla, kampanyaları yakala.",
    promo_text: "Bugüne özel seçili kahvelerde sürpriz fırsatlar.",
    daily_popup: true,
  },
  customers: [
    {
      id: 1,
      phone: "5058665406",
      name: "Liberte Gastro",
      email: "liberteserdivan@gmail.com",
      isAdmin: true,
      createdAt: new Date().toLocaleString("tr-TR"),
    },
  ],
  loyalty: {
    1: {
      customerId: 1,
      totalStamps: 0,
      availableRewards: 0,
      usedRewards: 0,
      lifetimeStamps: 0,
      level: "Bronze",
    },
  },
  categories: [
    { id: 1, name: "Kahveler", icon: "☕" },
    { id: 2, name: "Tatlılar", icon: "🍰" },
    { id: 3, name: "Burger", icon: "🍔" },
    { id: 4, name: "Soğuk İçecek", icon: "🧊" },
  ],
  items: [
    { id: 1, categoryId: 1, name: "Latte", description: "Espresso ve süt dengesi.", price: 90, image: "☕", featured: true, best: true, imageUrl: "" },
    { id: 2, categoryId: 1, name: "Ice Americano", description: "Buzlu, ferah americano.", price: 80, image: "🧊", featured: true, imageUrl: "" },
    { id: 3, categoryId: 2, name: "Çilekli Magnolia", description: "Çilek, krema ve bisküvi.", price: 145, image: "🍓", featured: true, best: true, imageUrl: "" },
    { id: 4, categoryId: 2, name: "San Sebastian", description: "Kremamsı cheesecake.", price: 170, image: "🍰", featured: true, imageUrl: "" },
    { id: 5, categoryId: 3, name: "Smash Burger", description: "140 g et, cheddar ve özel sos.", price: 295, image: "🍔", featured: true, best: true, imageUrl: "" },
    { id: 6, categoryId: 4, name: "Milkshake", description: "Yoğun kıvamlı soğuk lezzet.", price: 140, image: "🥤", featured: true, imageUrl: "" },
  ],
  campaigns: [
    { id: 1, title: "Bugüne Özel", body: "Smash Menü + kahve fırsatını kaçırma.", emoji: "🔥", active: true },
  ],
  notifications: [],
  history: [],
  feedback: [],
  pushSubscriptions: [],
};

function uid() {
  return Date.now() + Math.floor(Math.random() * 9999);
}

function cleanPhone(v = "") {
  return String(v).replace(/\D/g, "").replace(/^90/, "").replace(/^0/, "");
}

function validEmail(v = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).toLowerCase());
}

function money(n) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

function levelByStamps(n) {
  if (n >= 60) return "Black";
  if (n >= 35) return "Gold";
  if (n >= 20) return "Silver";
  return "Bronze";
}

function mergeDb(x) {
  if (!x || typeof x !== "object") return seed;
  return {
    ...seed,
    ...x,
    settings: { ...seed.settings, ...(x.settings || {}) },
    customers: Array.isArray(x.customers) ? x.customers : seed.customers,
    loyalty: x.loyalty || seed.loyalty,
    categories: Array.isArray(x.categories) ? x.categories : seed.categories,
    items: Array.isArray(x.items) ? x.items : seed.items,
    campaigns: Array.isArray(x.campaigns) ? x.campaigns : seed.campaigns,
    notifications: Array.isArray(x.notifications) ? x.notifications : [],
    history: Array.isArray(x.history) ? x.history : [],
    feedback: Array.isArray(x.feedback) ? x.feedback : [],
    pushSubscriptions: Array.isArray(x.pushSubscriptions) ? x.pushSubscriptions : [],
  };
}

function safeLocalLoad() {
  try {
    return mergeDb(JSON.parse(localStorage.getItem("liberteDB") || "null"));
  } catch {
    return seed;
  }
}

function saveLocal(db) {
  localStorage.setItem("liberteDB", JSON.stringify(db));
}

async function loadRemote() {
  try {
    const res = await fetch("/api/state", { method: "GET" });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ? mergeDb(json.data) : null;
  } catch {
    return null;
  }
}

async function saveRemote(db) {
  try {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: db }),
    });
  } catch {
    // sessiz kal; local kayıt devam eder
  }
}

function useDb() {
  const [db, setDb] = useState(safeLocalLoad);
  const [sync, setSync] = useState("yerel");

  useEffect(() => {
    loadRemote().then((r) => {
      if (r) {
        setDb(r);
        saveLocal(r);
        setSync("bulut");
      }
    });
  }, []);

  function commit(updater) {
    setDb((old) => {
      const next = typeof updater === "function" ? updater(old) : updater;
      const safe = mergeDb(next);
      saveLocal(safe);
      saveRemote(safe);
      setSync("bulut");
      return safe;
    });
  }

  return [db, commit, sync];
}

function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function Brand({ db, small = false }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <div className="brand-logo">
        {db.settings.logo ? <img src={db.settings.logo} alt="Liberte" /> : <span>Lİ</span>}
      </div>
      <div>
        <strong>{db.settings.app_name}</strong>
        {!small && <p>{db.settings.cafe_name}</p>}
      </div>
    </div>
  );
}

function Login({ db, commit, setSession }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("form");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState("");

  function validate() {
    const ph = cleanPhone(phone);
    if (ph.length < 10) return "Telefon numarası eksik.";
    if (name.trim().split(" ").filter(Boolean).length < 2) return "İsim soyisim zorunlu.";
    if (!validEmail(email)) return "Geçerli e-posta zorunlu.";
    return "";
  }

  async function sendCode() {
    const err = validate();
    if (err) return setInfo(err);
    setLoading(true);
    setInfo("");
    try {
      const res = await fetch("/api/auth/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name, email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Mail gönderilemedi.");
      setStep("code");
      setInfo(json.testCode ? `Test kodu: ${json.testCode}` : "Doğrulama kodu e-postana gönderildi.");
    } catch (e) {
      setInfo(e.message || "Mail gönderilemedi, lütfen tekrar dene.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (!code || code.length < 4) return setInfo("Mail kodunu gir.");
    setLoading(true);
    setInfo("");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name, email, code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Kod doğrulanamadı.");

      const ph = cleanPhone(phone);
      let customer = db.customers.find((c) => cleanPhone(c.phone) === ph || String(c.email).toLowerCase() === email.toLowerCase());

      commit((old) => {
        let next = mergeDb(old);
        let found = next.customers.find((c) => cleanPhone(c.phone) === ph || String(c.email).toLowerCase() === email.toLowerCase());
        if (!found) {
          found = {
            id: uid(),
            phone: ph,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            isAdmin: ph === "5058665406",
            createdAt: new Date().toLocaleString("tr-TR"),
          };
          next.customers = [...next.customers, found];
          next.loyalty[found.id] = {
            customerId: found.id,
            totalStamps: 0,
            availableRewards: 0,
            usedRewards: 0,
            lifetimeStamps: 0,
            level: "Bronze",
          };
        } else {
          next.customers = next.customers.map((c) => (c.id === found.id ? { ...c, name: name.trim(), email: email.trim().toLowerCase() } : c));
        }
        customer = found;
        return next;
      });

      setSession({ customerId: customer.id });
    } catch (e) {
      setInfo(e.message || "Kod doğrulanamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="ambient one" />
      <div className="ambient two" />
      <section className="login-card">
        <Brand db={db} />
        <h1>{db.settings.app_name}</h1>
        <p className="muted">QR sadakat kartın, özel kampanyalar ve menü tek yerde.</p>

        {step === "form" ? (
          <>
            <label>Telefon numarası</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xx xxx xx xx" />
            <label>İsim soyisim <b>zorunlu</b></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad Soyad" />
            <label>E-posta <b>onay zorunlu</b></label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mail@ornek.com" />
            <button onClick={sendCode} disabled={loading}>{loading ? "Gönderiliyor..." : "Mail Kodu Gönder"}</button>
          </>
        ) : (
          <>
            <label>Mail kodu</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 haneli kod" />
            <button onClick={verifyCode} disabled={loading}>{loading ? "Kontrol ediliyor..." : "Giriş Yap"}</button>
            <button className="ghost" onClick={() => setStep("form")}>Bilgileri değiştir</button>
          </>
        )}

        {info && <p className="info">{info}</p>}
      </section>
    </main>
  );
}

function Header({ db, customer, sync, onLogout }) {
  return (
    <header className="topbar">
      <Brand db={db} small />
      <div className="top-right">
        <span className="pill">{customer.name}</span>
        <span className="pill cloud">{sync}</span>
        <button className="icon-btn visible-logout" onClick={onLogout} title="Çıkış">↪</button>
      </div>
    </header>
  );
}

function BottomNav({ tab, setTab, admin }) {
  const items = [
    ["home", "⌂", "Ana"],
    ["menu", "☰", "Menü"],
    ["qr", "▣", "QR"],
    ["campaign", "✦", "Fırsat"],
  ];
  if (admin) items.push(["admin", "⚙", "Admin"]);

  return (
    <nav className="bottom-nav">
      {items.map(([id, icon, label]) => (
        <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
          <span>{icon}</span>
          <b>{label}</b>
        </button>
      ))}
    </nav>
  );
}

function Home({ db, customer, card, commit, setTab }) {
  const [popup, setPopup] = useState(() => !localStorage.getItem("libertePopupSeen"));
  const missing = Number(db.settings.stamp_threshold || 10) - Number(card.totalStamps || 0);
  const featured = db.items.filter((i) => i.featured).slice(0, 4);
  const campaign = db.campaigns.find((c) => c.active);

  return (
    <section className="screen home">
      {popup && db.settings.daily_popup && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <button className="close" onClick={() => { localStorage.setItem("libertePopupSeen", "1"); setPopup(false); }}>×</button>
            <span className="big-emoji">✨</span>
            <h2>Bugüne özel</h2>
            <p>{campaign?.body || db.settings.promo_text}</p>
            <button onClick={() => { setPopup(false); setTab("campaign"); }}>Fırsatı Gör</button>
          </div>
        </div>
      )}

      <div className="hero">
        <p>Premium Cafe Club</p>
        <h1>{db.settings.hero_title}</h1>
        <span>{db.settings.hero_subtitle}</span>
        <div className="hero-actions">
          <button onClick={() => setTab("menu")}>Menüye Bak</button>
          <button className="secondary" onClick={() => setTab("qr")}>QR Kart</button>
        </div>
      </div>

      <div className="vip-card">
        <div>
          <small>{card.level || levelByStamps(card.lifetimeStamps || 0)} VIP Seviye</small>
          <h3>Sadakat Durumu</h3>
        </div>
        <div className="stamp-circle">{card.totalStamps || 0}/{db.settings.stamp_threshold}</div>
        <div className="progress"><i style={{ width: `${Math.min(100, ((card.totalStamps || 0) / (db.settings.stamp_threshold || 10)) * 100)}%` }} /></div>
        <p>{missing > 0 ? `${missing} damga sonra ${db.settings.reward_description}` : "Ödülün hazır 🎁"}</p>
      </div>

      <div className="quick-grid">
        <button onClick={() => setTab("qr")}>▣<b>QR Kart</b></button>
        <button onClick={() => setTab("menu")}>☕<b>Menü</b></button>
        <button onClick={() => setTab("campaign")}>🔔<b>Fırsatlar</b></button>
        <a href={links.instagram} target="_blank" rel="noreferrer">📸<b>Instagram</b></a>
      </div>

      <h2 className="section-title">Bugün en çok sevilenler</h2>
      <div className="product-row">
        {featured.map((item) => <ProductCard key={item.id} item={item} />)}
      </div>

      <ReviewCard />
    </section>
  );
}

function ProductCard({ item }) {
  return (
    <article className="product-card">
      <div className="product-image">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <span>{item.image || "🍽️"}</span>}</div>
      <div>
        <h3>{item.name}</h3>
        <p>{item.description}</p>
        <b>{money(item.price)}</b>
      </div>
    </article>
  );
}

function ReviewCard() {
  const [rating, setRating] = useState(0);
  return (
    <div className="review-card">
      <h3>Deneyimini puanla</h3>
      <p>Memnun kaldıysan Google yorumun bize çok destek olur.</p>
      <div className="stars">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} onClick={() => setRating(s)} className={rating >= s ? "on" : ""}>★</button>
        ))}
      </div>
      {rating >= 5 ? <a className="full-btn" href={links.googleReview} target="_blank" rel="noreferrer">Google’da yorum yap</a> : rating > 0 ? <p className="info">Geri bildirimin bizim için değerli. Teşekkürler.</p> : null}
    </div>
  );
}

function Menu({ db, commit }) {
  const [active, setActive] = useState("all");
  const cats = db.categories;
  const list = db.items.filter((i) => active === "all" || String(i.categoryId) === String(active));

  return (
    <section className="screen">
      <h1>Menü</h1>
      <div className="cat-scroll">
        <button className={active === "all" ? "active" : ""} onClick={() => setActive("all")}>✨<b>Tümü</b></button>
        {cats.map((c) => (
          <button key={c.id} className={String(active) === String(c.id) ? "active" : ""} onClick={() => setActive(c.id)}>
            <span>{c.icon}</span><b>{c.name}</b>
          </button>
        ))}
      </div>
      <div className="menu-list">
        {list.map((item) => <ProductCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}

function Qr({ db, customer, card }) {
  const qrValue = JSON.stringify({ type: "liberte-customer", id: customer.id, phone: customer.phone });
  return (
    <section className="screen qr-screen">
      <h1>QR Sadakat Kartı</h1>
      <div className="qr-card">
        <Brand db={db} />
        <div className="qr-box">
          <QRCodeCanvas value={qrValue} size={220} includeMargin />
        </div>
        <h2>{customer.name}</h2>
        <p>{customer.phone}</p>
        <div className="stamp-row">
          {Array.from({ length: Number(db.settings.stamp_threshold || 10) }).map((_, i) => (
            <span key={i} className={i < (card.totalStamps || 0) ? "filled" : ""}>●</span>
          ))}
        </div>
        <p className="info">Kasada bu QR kodu göstererek damga kazanabilirsin.</p>
      </div>
    </section>
  );
}

function Campaign({ db, commit }) {
  async function enablePush() {
    try {
      if (!("serviceWorker" in navigator) || !("Notification" in window)) throw new Error("Bu tarayıcı bildirim desteklemiyor.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Bildirim izni verilmedi.");
      const { initializeApp } = await import("firebase/app");
      const { getMessaging, getToken } = await import("firebase/messaging");
      const app = initializeApp(FIREBASE_CONFIG);
      const messaging = getMessaging(app);
      const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
      if (!token) throw new Error("Token alınamadı.");
      commit((old) => ({ ...old, pushSubscriptions: [...new Set([...(old.pushSubscriptions || []), token])] }));
      alert("Bildirimler açıldı.");
    } catch (e) {
      alert(`Bildirim kurulamadı: ${e.message}`);
    }
  }

  return (
    <section className="screen">
      <h1>Fırsatlar</h1>
      <div className="campaign-list">
        {db.campaigns.map((c) => (
          <article className="campaign-card" key={c.id}>
            <span>{c.emoji || "✨"}</span>
            <h2>{c.title}</h2>
            <p>{c.body}</p>
          </article>
        ))}
      </div>
      <button onClick={enablePush}>🔔 Bildirimleri Aç</button>
      <div className="social-grid">
        <a href={links.instagram} target="_blank" rel="noreferrer">📸 Instagram</a>
        <a href={links.googleReview} target="_blank" rel="noreferrer">⭐ Google Yorum</a>
        <a href={links.yemeksepeti} target="_blank" rel="noreferrer">🛵 Yemeksepeti</a>
        <a href={links.maps} target="_blank" rel="noreferrer">📍 Yol Tarifi</a>
      </div>
    </section>
  );
}

function Admin({ db, commit }) {
  const [section, setSection] = useState("loyalty");
  return (
    <section className="screen admin">
      <h1>Admin Panel</h1>
      <div className="admin-tabs">
        {[
          ["loyalty", "Sadakat"],
          ["products", "Ürünler"],
          ["categories", "Kategoriler"],
          ["users", "Kullanıcılar"],
          ["settings", "Tasarım"],
          ["push", "Push"],
        ].map(([id, label]) => <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}>{label}</button>)}
      </div>
      {section === "loyalty" && <AdminLoyalty db={db} commit={commit} />}
      {section === "products" && <AdminProducts db={db} commit={commit} />}
      {section === "categories" && <AdminCategories db={db} commit={commit} />}
      {section === "users" && <AdminUsers db={db} />}
      {section === "settings" && <AdminSettings db={db} commit={commit} />}
      {section === "push" && <AdminPush db={db} commit={commit} />}
    </section>
  );
}

function AdminLoyalty({ db, commit }) {
  const [phone, setPhone] = useState("");
  const videoRef = useRef(null);

  function addStamp(count = 1, source = "Admin") {
    const ph = cleanPhone(phone);
    const customer = db.customers.find((c) => cleanPhone(c.phone) === ph || String(c.id) === String(phone));
    if (!customer) return alert("Müşteri bulunamadı.");
    commit((old) => {
      const next = mergeDb(old);
      const current = next.loyalty[customer.id] || { customerId: customer.id, totalStamps: 0, availableRewards: 0, usedRewards: 0, lifetimeStamps: 0, level: "Bronze" };
      const threshold = Number(next.settings.stamp_threshold || 10);
      const total = Math.max(0, Number(current.totalStamps || 0) + count);
      const lifetime = Math.max(0, Number(current.lifetimeStamps || 0) + Math.max(0, count));
      const rewards = Number(current.availableRewards || 0) + Math.floor(total / threshold);
      next.loyalty[customer.id] = { ...current, totalStamps: total % threshold, availableRewards: rewards, lifetimeStamps: lifetime, level: levelByStamps(lifetime) };
      next.history = [{ id: uid(), customerId: customer.id, name: customer.name, count, source, createdAt: new Date().toLocaleString("tr-TR") }, ...(next.history || [])];
      return next;
    });
  }

  function useReward() {
    const ph = cleanPhone(phone);
    const customer = db.customers.find((c) => cleanPhone(c.phone) === ph || String(c.id) === String(phone));
    if (!customer) return alert("Müşteri bulunamadı.");
    commit((old) => {
      const next = mergeDb(old);
      const current = next.loyalty[customer.id];
      if (!current || current.availableRewards <= 0) {
        alert("Kullanılabilir ödül yok.");
        return next;
      }
      next.loyalty[customer.id] = { ...current, availableRewards: current.availableRewards - 1, usedRewards: Number(current.usedRewards || 0) + 1 };
      next.history = [{ id: uid(), customerId: customer.id, name: customer.name, count: 0, source: "Ödül Kullanıldı", createdAt: new Date().toLocaleString("tr-TR") }, ...(next.history || [])];
      return next;
    });
  }

  async function scanQr() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Kamera desteklenmiyor.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) videoRef.current.srcObject = stream;
      alert("Kamera açıldı. Bu stabil sürümde QR sonucu manuel telefona yazılır.");
    } catch (e) {
      alert(`Kamera açılamadı: ${e.message}`);
    }
  }

  return (
    <div className="panel-card">
      <h2>QR ile Damga Ver</h2>
      <video ref={videoRef} autoPlay playsInline muted className="qr-video" />
      <button onClick={scanQr}>Kamera ile QR Okut</button>
      <label>Müşteri telefonu / ID</label>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Müşteri telefonu" />
      <div className="split">
        <button onClick={() => addStamp(1)}>+1 Damga Ekle</button>
        <button className="secondary" onClick={() => addStamp(-1)}>Damga Sil</button>
      </div>
      <button className="secondary" onClick={useReward}>🎁 Ödül Kullandır</button>
      <h3>Son İşlemler</h3>
      {(db.history || []).slice(0, 8).map((h) => <p key={h.id} className="log-line">{h.createdAt} — {h.name} — {h.source} {h.count ? `(${h.count})` : ""}</p>)}
    </div>
  );
}

function AdminProducts({ db, commit }) {
  const empty = { name: "", description: "", price: "", categoryId: db.categories[0]?.id || 1, image: "🍽️", imageUrl: "", featured: true };
  const [form, setForm] = useState(empty);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (file) setForm({ ...form, imageUrl: await fileToDataUrl(file) });
  }

  function add() {
    if (!form.name || !form.price) return alert("Ürün adı ve fiyat zorunlu.");
    commit((old) => ({ ...old, items: [...old.items, { ...form, id: uid(), price: Number(form.price) }] }));
    setForm(empty);
  }

  function update(id, patch) {
    commit((old) => ({ ...old, items: old.items.map((i) => i.id === id ? { ...i, ...patch } : i) }));
  }

  function remove(id) {
    if (!confirm("Ürün silinsin mi?")) return;
    commit((old) => ({ ...old, items: old.items.filter((i) => i.id !== id) }));
  }

  return (
    <div className="panel-card">
      <h2>Ürün Yönetimi</h2>
      <div className="form-grid">
        <input placeholder="Ürün adı" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Fiyat" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: Number(e.target.value) })}>
          {db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input placeholder="Emoji" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
        <textarea placeholder="Açıklama" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input type="file" accept="image/*" onChange={onFile} />
      </div>
      <button onClick={add}>Ürün Ekle</button>
      <div className="admin-list">
        {db.items.map((item) => (
          <div key={item.id} className="admin-row">
            <span>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : item.image}</span>
            <input value={item.name} onChange={(e) => update(item.id, { name: e.target.value })} />
            <input value={item.price} onChange={(e) => update(item.id, { price: Number(e.target.value) })} />
            <button className="danger" onClick={() => remove(item.id)}>Sil</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminCategories({ db, commit }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("✨");
  function add() {
    if (!name.trim()) return;
    commit((old) => ({ ...old, categories: [...old.categories, { id: uid(), name: name.trim(), icon }] }));
    setName("");
    setIcon("✨");
  }
  function update(id, patch) {
    commit((old) => ({ ...old, categories: old.categories.map((c) => c.id === id ? { ...c, ...patch } : c) }));
  }
  function remove(id) {
    commit((old) => ({ ...old, categories: old.categories.filter((c) => c.id !== id) }));
  }
  return (
    <div className="panel-card">
      <h2>Kategori Yönetimi</h2>
      <div className="split">
        <input placeholder="Kategori adı" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Emoji" value={icon} onChange={(e) => setIcon(e.target.value)} />
      </div>
      <button onClick={add}>Kategori Ekle</button>
      {db.categories.map((c) => (
        <div className="admin-row" key={c.id}>
          <input value={c.icon} onChange={(e) => update(c.id, { icon: e.target.value })} />
          <input value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} />
          <button className="danger" onClick={() => remove(c.id)}>Sil</button>
        </div>
      ))}
    </div>
  );
}

function AdminUsers({ db }) {
  return (
    <div className="panel-card">
      <h2>Kayıtlı Kullanıcılar</h2>
      {db.customers.map((c) => {
        const card = db.loyalty[c.id] || {};
        return (
          <div className="user-row" key={c.id}>
            <div>
              <b>{c.name}</b>
              <p>{c.phone} — {c.email}</p>
            </div>
            <span>{card.totalStamps || 0} damga / {card.availableRewards || 0} ödül</span>
          </div>
        );
      })}
    </div>
  );
}

function AdminSettings({ db, commit }) {
  const s = db.settings;
  async function logoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const logo = await fileToDataUrl(file);
    commit((old) => ({ ...old, settings: { ...old.settings, logo } }));
  }
  function set(k, v) {
    commit((old) => ({ ...old, settings: { ...old.settings, [k]: v } }));
  }
  return (
    <div className="panel-card">
      <h2>Tasarım Ayarları</h2>
      <label>Logo</label>
      <input type="file" accept="image/*" onChange={logoFile} />
      <label>Uygulama adı</label>
      <input value={s.app_name} onChange={(e) => set("app_name", e.target.value)} />
      <label>Hero başlık</label>
      <input value={s.hero_title} onChange={(e) => set("hero_title", e.target.value)} />
      <label>Arka plan</label>
      <input type="color" value={s.bg} onChange={(e) => set("bg", e.target.value)} />
      <label>Kart rengi</label>
      <input type="color" value={s.card} onChange={(e) => set("card", e.target.value)} />
      <label>Vurgu rengi</label>
      <input type="color" value={s.accent} onChange={(e) => set("accent", e.target.value)} />
    </div>
  );
}

function AdminPush({ db, commit }) {
  const [title, setTitle] = useState("Liberte Club");
  const [body, setBody] = useState("");
  async function send() {
    if (!body.trim()) return alert("Bildirim metni yaz.");
    commit((old) => ({ ...old, notifications: [{ id: uid(), title, body, createdAt: new Date().toLocaleString("tr-TR") }, ...(old.notifications || [])] }));
    try {
      await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
    } catch {}
    alert("Bildirim kaydedildi/gönderim denendi.");
  }
  return (
    <div className="panel-card">
      <h2>Push Bildirim</h2>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Başlık" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Bugüne özel kampanya..." />
      <button onClick={send}>Bildirim Gönder</button>
      <p className="info">Kayıtlı cihaz: {(db.pushSubscriptions || []).length}</p>
    </div>
  );
}

function App() {
  const [db, commit, sync] = useDb();
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem("liberteSession") || "null"); } catch { return null; }
  });
  const [tab, setTab] = useState("home");

  useEffect(() => {
    if (session) localStorage.setItem("liberteSession", JSON.stringify(session));
    else localStorage.removeItem("liberteSession");
  }, [session]);

  const style = {
    "--bg": db.settings.bg,
    "--card": db.settings.card,
    "--accent": db.settings.accent,
  };

  if (!session) return <div style={style}><Login db={db} commit={commit} setSession={setSession} /></div>;

  const customer = db.customers.find((c) => c.id === session.customerId) || db.customers[0];
  const card = db.loyalty[customer.id] || { customerId: customer.id, totalStamps: 0, availableRewards: 0, usedRewards: 0, lifetimeStamps: 0, level: "Bronze" };

  return (
    <div className="app" style={style}>
      <Header db={db} customer={customer} sync={sync} onLogout={() => { setSession(null); setTab("home"); }} />
      <main className="main">
        {tab === "home" && <Home db={db} customer={customer} card={card} commit={commit} setTab={setTab} />}
        {tab === "menu" && <Menu db={db} commit={commit} />}
        {tab === "qr" && <Qr db={db} customer={customer} card={card} />}
        {tab === "campaign" && <Campaign db={db} commit={commit} />}
        {tab === "admin" && customer.isAdmin && <Admin db={db} commit={commit} />}
      </main>
      <BottomNav tab={tab} setTab={setTab} admin={customer.isAdmin} />
    </div>
  );
}

function ErrorFallback({ error }) {
  return (
    <div className="fatal">
      <h1>Uygulama başlatılamadı</h1>
      <p>{String(error?.message || error || "Bilinmeyen hata")}</p>
      <button onClick={() => { localStorage.clear(); location.reload(); }}>Temizle ve yeniden başlat</button>
    </div>
  );
}

try {
  createRoot(document.getElementById("root")).render(<App />);
} catch (e) {
  createRoot(document.getElementById("root")).render(<ErrorFallback error={e} />);
}
