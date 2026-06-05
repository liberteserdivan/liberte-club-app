import { writeFileSync } from 'node:fs';
import {
  LEGAL_UPDATED,
  privacyPolicySections,
  termsOfUseSections
} from '../src/lib/legalContent.js';

// Yasal metinleri statik HTML olarak üret — mağaza URL'leri için
function renderLegalPage(title, sections) {
  const body = sections.map((section) => (
    `<section><h2>${section.title}</h2><p>${section.body}</p></section>`
  )).join('\n');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Liberte Club</title>
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
  <p class="meta">Liberte Gastro Cafe · Güncelleme: ${LEGAL_UPDATED}</p>
  ${body}
  <p class="meta">Sorularınız için: <a href="mailto:liberteserdivan@gmail.com">liberteserdivan@gmail.com</a></p>
</body>
</html>`;
}

writeFileSync('public/gizlilik.html', renderLegalPage('Gizlilik Politikası', privacyPolicySections));
writeFileSync('public/kullanim-sartlari.html', renderLegalPage('Kullanım Şartları', termsOfUseSections));
console.log('Yasal sayfalar üretildi: public/gizlilik.html, public/kullanim-sartlari.html');
