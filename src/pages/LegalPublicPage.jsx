import {
  LEGAL_UPDATED,
  PRIVACY_PAGE_TITLE,
  TERMS_PAGE_TITLE,
  privacyPolicySections,
  termsOfUseSections
} from '../lib/legalContent.js';

// Herkese acik yasal sayfa — giris gerektirmez (/privacy, /terms)
export default function LegalPublicPage({ type }) {
  const isPrivacy = type === 'privacy';
  const title = isPrivacy ? PRIVACY_PAGE_TITLE : TERMS_PAGE_TITLE;
  const sections = isPrivacy ? privacyPolicySections : termsOfUseSections;

  return (
    <div className="legalPublicPage">
      <article className="legalPublicCard">
        <header className="legalPublicHead">
          <h1>{title}</h1>
          <p className="legalPublicMeta">Son güncelleme: {LEGAL_UPDATED}</p>
        </header>
        <div className="legalPublicBody">
          {sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
        <footer className="legalPublicFoot">
          <a href="/">Uygulamaya dön</a>
          {!isPrivacy && (
            <>
              {' · '}
              <a href="/privacy">Gizlilik Politikası</a>
            </>
          )}
          {isPrivacy && (
            <>
              {' · '}
              <a href="/terms">Kullanım Şartları</a>
            </>
          )}
        </footer>
      </article>
    </div>
  );
}
