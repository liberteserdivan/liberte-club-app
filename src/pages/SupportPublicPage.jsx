import {
  SUPPORT_INTRO,
  SUPPORT_PAGE_TITLE,
  SUPPORT_TOPICS,
  supportContact
} from '../lib/supportContent.js';
import { CLUB_APP_NAME } from '../lib/constants.js';

// Herkese açık destek sayfası — App Store Support URL (/support)
export default function SupportPublicPage() {
  return (
    <div className="supportPublicPage">
      <header className="supportPublicHero">
        <p className="supportPublicEyebrow">{CLUB_APP_NAME}</p>
        <h1>{SUPPORT_PAGE_TITLE}</h1>
        <p className="supportPublicLead">{SUPPORT_INTRO}</p>
      </header>

      <div className="supportPublicShell">
        <section className="supportPublicCard">
          <h2>İletişim</h2>
          <ul className="supportContactList">
            <li>
              <span>E-posta</span>
              <a href={`mailto:${supportContact.email}`}>{supportContact.email}</a>
            </li>
            <li>
              <span>Telefon</span>
              <a href={`tel:${supportContact.phoneTel}`}>{supportContact.phoneDisplay}</a>
            </li>
            <li>
              <span>Adres</span>
              <address>{supportContact.address}</address>
            </li>
          </ul>
        </section>

        <section className="supportPublicCard">
          <h2>Destek konuları</h2>
          <ul className="supportTopicList">
            {SUPPORT_TOPICS.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ul>
        </section>

        <footer className="supportPublicFoot">
          <a href={supportContact.privacyUrl}>Gizlilik Politikası</a>
          <span aria-hidden="true"> · </span>
          <a href="/">Uygulamaya dön</a>
        </footer>
      </div>
    </div>
  );
}
