import { writeFileSync } from 'node:fs';
import {
  LEGAL_UPDATED,
  PRIVACY_PAGE_TITLE,
  TERMS_PAGE_TITLE,
  privacyPolicySections,
  termsOfUseSections
} from '../src/lib/legalContent.js';

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

writeFileSync('public/privacy.html', renderLegalPage(PRIVACY_PAGE_TITLE, privacyPolicySections));
writeFileSync('public/terms.html', renderLegalPage(TERMS_PAGE_TITLE, termsOfUseSections));
writeFileSync('public/gizlilik.html', renderLegalPage(PRIVACY_PAGE_TITLE, privacyPolicySections));
writeFileSync('public/kullanim-sartlari.html', renderLegalPage(TERMS_PAGE_TITLE, termsOfUseSections));
console.log('Yasal sayfalar uretildi: public/privacy.html, public/terms.html');
