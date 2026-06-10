import { writeFileSync } from 'node:fs';
import {
  LEGAL_UPDATED,
  PRIVACY_PAGE_TITLE,
  TERMS_PAGE_TITLE,
  privacyPolicySections,
  termsOfUseSections
} from '../src/lib/legalContent.js';
import {
  SUPPORT_INTRO,
  SUPPORT_PAGE_TITLE,
  SUPPORT_TOPICS,
  supportContact
} from '../src/lib/supportContent.js';
import { CLUB_APP_NAME } from '../src/lib/constants.js';

// Yasal metinleri statik HTML olarak uret — JS kapali tarayicilar ve yedek erisim
function renderLegalPage(title, sections) {
  const body = sections.map((section) => (
    `<section><h2>${section.title}</h2><p>${section.body}</p></section>`
  )).join('\n');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px 20px 48px;color:#0B2F26;line-height:1.55;background:#F7FAF8}
    h1{font-size:1.6rem;margin:0 0 6px}
    .meta{color:#5A6B64;font-size:.92rem;margin:0 0 28px}
    section{margin-bottom:22px}
    h2{font-size:1.05rem;margin:0 0 8px}
    p{margin:0;color:#2A3D36}
    a{color:#126047}
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">Son güncelleme: ${LEGAL_UPDATED}</p>
  ${body}
  <p class="meta"><a href="/">Uygulamaya dön</a></p>
</body>
</html>`;
}

// App Store Support URL — statik HTML (Apple incelemesi JS gerektirmez)
function renderSupportPage() {
  const topics = SUPPORT_TOPICS.map((topic) => `<li>${topic}</li>`).join('\n');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Liberte Gastro Cafe uygulama destek ve iletişim bilgileri." />
  <title>${SUPPORT_PAGE_TITLE}</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#F7FAF8;color:#0B2F26;line-height:1.55}
    .hero{padding:32px 20px 36px;color:#fff;background:radial-gradient(circle at 88% 8%,rgba(216,194,157,.28),transparent 34%),radial-gradient(circle at 8% 88%,rgba(159,220,199,.16),transparent 32%),linear-gradient(168deg,#11100D 0%,#126047 58%,#071B16 100%);border-radius:0 0 32px 32px}
    .eyebrow{margin:0 0 8px;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.72);font-weight:700}
    h1{margin:0 0 12px;font-size:clamp(1.45rem,4.6vw,1.85rem);line-height:1.25;max-width:640px}
    .lead{margin:0;max-width:620px;color:rgba(255,255,255,.88);font-size:.98rem}
    .shell{max-width:720px;margin:0 auto;padding:24px 16px 48px}
    .card{margin-bottom:18px;padding:22px 20px;background:#fff;border:1px solid rgba(18,96,71,.12);border-radius:20px;box-shadow:0 10px 28px rgba(11,47,38,.06)}
    .card h2{margin:0 0 16px;font-size:1.05rem;color:#126047}
    .contact{list-style:none;margin:0;padding:0;display:grid;gap:14px}
    .contact li{display:grid;gap:4px}
    .contact span{font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:#5A6B64;font-weight:700}
    .contact a,.contact address{margin:0;font-style:normal;color:#0B2F26;font-size:.98rem}
    .contact a{color:#126047;font-weight:700;text-decoration:none}
    .topics{margin:0;padding:0;list-style:none;display:grid;gap:10px}
    .topics li{position:relative;padding-left:18px;color:#2A3D36;font-size:.96rem}
    .topics li::before{content:'';position:absolute;left:0;top:.55em;width:7px;height:7px;border-radius:50%;background:linear-gradient(135deg,#126047,#9FDCC7)}
    .foot{margin-top:8px;text-align:center;font-size:.9rem;color:#5A6B64}
    .foot a{color:#126047;font-weight:700;text-decoration:none}
  </style>
</head>
<body>
  <header class="hero">
    <p class="eyebrow">${CLUB_APP_NAME}</p>
    <h1>${SUPPORT_PAGE_TITLE}</h1>
    <p class="lead">${SUPPORT_INTRO}</p>
  </header>
  <main class="shell">
    <section class="card">
      <h2>İletişim</h2>
      <ul class="contact">
        <li><span>E-posta</span><a href="mailto:${supportContact.email}">${supportContact.email}</a></li>
        <li><span>Telefon</span><a href="tel:${supportContact.phoneTel}">${supportContact.phoneDisplay}</a></li>
        <li><span>Adres</span><address>${supportContact.address}</address></li>
      </ul>
    </section>
    <section class="card">
      <h2>Destek konuları</h2>
      <ul class="topics">
        ${topics}
      </ul>
    </section>
    <footer class="foot">
      <a href="${supportContact.privacyUrl}">Gizlilik Politikası</a>
      ·
      <a href="/">Uygulamaya dön</a>
    </footer>
  </main>
</body>
</html>`;
}

writeFileSync('public/privacy.html', renderLegalPage(PRIVACY_PAGE_TITLE, privacyPolicySections));
writeFileSync('public/terms.html', renderLegalPage(TERMS_PAGE_TITLE, termsOfUseSections));
writeFileSync('public/gizlilik.html', renderLegalPage(PRIVACY_PAGE_TITLE, privacyPolicySections));
writeFileSync('public/kullanim-sartlari.html', renderLegalPage(TERMS_PAGE_TITLE, termsOfUseSections));
writeFileSync('public/support.html', renderSupportPage());
console.log('Yasal sayfalar uretildi: public/privacy.html, public/terms.html, public/support.html');
